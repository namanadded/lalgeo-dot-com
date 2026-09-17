import Foundation

protocol MapsAPI: Sendable {
    func validate(apiKey: String) async throws
    func listMaps(apiKey: String) async throws -> [LalGeoMap]
    func createMap(_ draft: MapDraft, apiKey: String) async throws -> LalGeoMap
    func getMap(id: String, apiKey: String) async throws -> LalGeoMap
    func loadMapContents(mapID: String, apiKey: String) async throws -> [LayerFeatures]
    func createLayer(_ draft: LayerDraft, mapID: String, apiKey: String) async throws -> MapLayer
    func createPoint(_ draft: PointFeatureDraft, mapID: String, layerID: String, apiKey: String) async throws -> GeoJSONFeature
    func exportMap(id: String, apiKey: String) async throws -> Data
}

struct MapsAPIClient: MapsAPI, @unchecked Sendable {
    static let productionBaseURL = URL(string: "https://api.lalgeo.com")!

    private let baseURL: URL
    private let session: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(baseURL: URL = Self.productionBaseURL, session: URLSession? = nil) {
        self.baseURL = baseURL
        if let session {
            self.session = session
        } else {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForRequest = 20
            configuration.timeoutIntervalForResource = 30
            configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
            configuration.urlCache = nil
            configuration.urlCredentialStorage = nil
            self.session = URLSession(configuration: configuration)
        }
    }

    func validate(apiKey: String) async throws {
        var components = URLComponents(url: mapsURL, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "limit", value: "1"),
            URLQueryItem(name: "offset", value: "0")
        ]
        let request = authorizedRequest(url: components.url!, apiKey: apiKey)
        let _: MapsEnvelope = try await decode(request, expectedStatus: 200)
    }

    func listMaps(apiKey: String) async throws -> [LalGeoMap] {
        let pageSize = 100
        var offset = 0
        var result: [LalGeoMap] = []

        while true {
            var components = URLComponents(url: mapsURL, resolvingAgainstBaseURL: false)!
            components.queryItems = [
                URLQueryItem(name: "limit", value: String(pageSize)),
                URLQueryItem(name: "offset", value: String(offset))
            ]
            let request = authorizedRequest(url: components.url!, apiKey: apiKey)
            let page: MapsEnvelope = try await decode(request, expectedStatus: 200)
            result.append(contentsOf: page.maps)
            guard page.pagination.count == pageSize else { break }
            offset += page.pagination.count
        }

        return result
    }

    func createMap(_ draft: MapDraft, apiKey: String) async throws -> LalGeoMap {
        var request = authorizedRequest(url: mapsURL, apiKey: apiKey, method: "POST")
        request.httpBody = try encoder.encode(draft)

        do {
            let envelope: MapEnvelope = try await decode(request, expectedStatus: 201)
            return envelope.map
        } catch let original as MapsAPIError where original == .offline || {
            if case .transport = original { return true }
            return false
        }() {
            // POST may have reached the server before connectivity failed. The stable
            // client ID lets us reconcile instead of creating a duplicate on retry.
            do {
                return try await getMap(id: draft.id, apiKey: apiKey)
            } catch let reconciliation as MapsAPIError {
                if case let .server(status, _, _, _) = reconciliation, status == 404 {
                    throw original
                }
                throw reconciliation
            }
        }
    }

    func getMap(id: String, apiKey: String) async throws -> LalGeoMap {
        let request = authorizedRequest(url: mapURL(id: id), apiKey: apiKey)
        let envelope: MapEnvelope = try await decode(request, expectedStatus: 200)
        return envelope.map
    }

    func loadMapContents(mapID: String, apiKey: String) async throws -> [LayerFeatures] {
        let layersRequest = authorizedRequest(
            url: mapURL(id: mapID).appendingPathComponent("layers"),
            apiKey: apiKey
        )
        let envelope: LayersEnvelope = try await decode(layersRequest, expectedStatus: 200)

        return try await withThrowingTaskGroup(of: LayerFeatures.self) { group in
            for layer in envelope.layers {
                group.addTask {
                    let features = try await listFeatures(mapID: mapID, layerID: layer.id, apiKey: apiKey)
                    return LayerFeatures(layer: layer, features: features)
                }
            }

            var result: [LayerFeatures] = []
            for try await layer in group { result.append(layer) }
            return result.sorted {
                if $0.layer.position == $1.layer.position { return $0.layer.id < $1.layer.id }
                return $0.layer.position < $1.layer.position
            }
        }
    }

    func createLayer(_ draft: LayerDraft, mapID: String, apiKey: String) async throws -> MapLayer {
        var request = authorizedRequest(url: layersURL(mapID: mapID), apiKey: apiKey, method: "POST")
        request.httpBody = try encoder.encode(draft)
        do {
            let envelope: LayerEnvelope = try await decode(request, expectedStatus: 201)
            return envelope.layer
        } catch let original as MapsAPIError where Self.shouldReconcile(original) {
            do {
                let existing = try await getLayer(id: draft.id, mapID: mapID, apiKey: apiKey)
                guard existing.mapID == mapID, existing.name == draft.name,
                      existing.geometryType == draft.geometryType else {
                    throw Self.idCollision("A different layer already uses this ID.", original: original)
                }
                return existing
            } catch let reconciliation as MapsAPIError where Self.isNotFound(reconciliation) {
                throw original
            }
        }
    }

    func createPoint(_ draft: PointFeatureDraft, mapID: String, layerID: String, apiKey: String) async throws -> GeoJSONFeature {
        var request = authorizedRequest(url: featuresURL(mapID: mapID, layerID: layerID), apiKey: apiKey, method: "POST")
        request.httpBody = try encoder.encode(draft)
        do {
            let envelope: CreatedFeaturesEnvelope = try await decode(request, expectedStatus: 201)
            guard envelope.features.count == 1, let feature = envelope.features.first,
                  Self.samePoint(feature, as: draft) else { throw MapsAPIError.invalidResponse }
            return feature
        } catch let original as MapsAPIError where Self.shouldReconcile(original) {
            do {
                let existing = try await getFeature(id: draft.id, mapID: mapID, layerID: layerID, apiKey: apiKey)
                guard Self.samePoint(existing, as: draft) else {
                    throw Self.idCollision("A different feature already uses this ID.", original: original)
                }
                return existing
            } catch let reconciliation as MapsAPIError where Self.isNotFound(reconciliation) {
                throw original
            }
        }
    }

    private func getLayer(id: String, mapID: String, apiKey: String) async throws -> MapLayer {
        let request = authorizedRequest(url: layersURL(mapID: mapID).appendingPathComponent(id), apiKey: apiKey)
        let envelope: LayerEnvelope = try await decode(request, expectedStatus: 200)
        return envelope.layer
    }

    private func getFeature(id: String, mapID: String, layerID: String, apiKey: String) async throws -> GeoJSONFeature {
        let request = authorizedRequest(url: featuresURL(mapID: mapID, layerID: layerID).appendingPathComponent(id), apiKey: apiKey)
        return try await decode(request, expectedStatus: 200)
    }

    private static func samePoint(_ feature: GeoJSONFeature, as draft: PointFeatureDraft) -> Bool {
        feature.type == draft.type && feature.id == draft.id &&
            feature.geometry == draft.geometry && feature.properties == draft.properties
    }

    private static func shouldReconcile(_ error: MapsAPIError) -> Bool {
        switch error {
        case .offline, .transport, .invalidResponse: true
        case let .server(status, _, _, _): status == 409
        case .unauthorized: false
        }
    }

    private static func isNotFound(_ error: MapsAPIError) -> Bool {
        if case let .server(status, _, _, _) = error { return status == 404 }
        return false
    }

    private static func idCollision(_ message: String, original: MapsAPIError) -> MapsAPIError {
        .server(status: 409, code: "ID_CONFLICT", message: message, requestID: original.requestID)
    }

    func exportMap(id: String, apiKey: String) async throws -> Data {
        let request = authorizedRequest(
            url: mapURL(id: id).appendingPathComponent("export"),
            apiKey: apiKey
        )
        let (data, response) = try await send(request)
        try validate(response: response, data: data, expectedStatus: 200)
        return data
    }

    private func listFeatures(mapID: String, layerID: String, apiKey: String) async throws -> [GeoJSONFeature] {
        let pageSize = 100
        var offset = 0
        var result: [GeoJSONFeature] = []

        while true {
            let url = mapURL(id: mapID)
                .appendingPathComponent("layers")
                .appendingPathComponent(layerID)
                .appendingPathComponent("features")
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            components.queryItems = [
                URLQueryItem(name: "limit", value: String(pageSize)),
                URLQueryItem(name: "offset", value: String(offset))
            ]
            let request = authorizedRequest(url: components.url!, apiKey: apiKey)
            let page: FeatureCollection = try await decode(request, expectedStatus: 200)
            result.append(contentsOf: page.features)
            guard page.pagination?.count == pageSize else { break }
            offset += page.pagination?.count ?? 0
        }

        return result
    }

    private var mapsURL: URL {
        baseURL.appendingPathComponent("v1").appendingPathComponent("maps")
    }

    private func layersURL(mapID: String) -> URL {
        mapURL(id: mapID).appendingPathComponent("layers")
    }

    private func featuresURL(mapID: String, layerID: String) -> URL {
        layersURL(mapID: mapID).appendingPathComponent(layerID).appendingPathComponent("features")
    }

    private func mapURL(id: String) -> URL {
        mapsURL.appendingPathComponent(id)
    }

    private func authorizedRequest(url: URL, apiKey: String, method: String = "GET") -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if method == "POST" || method == "PATCH" {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    private func decode<Value: Decodable>(_ request: URLRequest, expectedStatus: Int) async throws -> Value {
        let (data, response) = try await send(request)
        try validate(response: response, data: data, expectedStatus: expectedStatus)
        do {
            return try decoder.decode(Value.self, from: data)
        } catch {
            throw MapsAPIError.invalidResponse
        }
    }

    private func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw MapsAPIError.invalidResponse
            }
            return (data, httpResponse)
        } catch let error as MapsAPIError {
            throw error
        } catch let error as URLError {
            switch error.code {
            case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost:
                throw MapsAPIError.offline
            default:
                throw MapsAPIError.transport("Couldn’t reach LalGeo. \(error.localizedDescription)")
            }
        } catch {
            throw MapsAPIError.transport("Couldn’t reach LalGeo. \(error.localizedDescription)")
        }
    }

    private func validate(response: HTTPURLResponse, data: Data, expectedStatus: Int) throws {
        guard response.statusCode == expectedStatus else {
            let envelope = try? decoder.decode(APIErrorEnvelope.self, from: data)
            let requestID = envelope?.requestID ?? response.value(forHTTPHeaderField: "X-Request-Id")
            let message = envelope?.error.message ?? HTTPURLResponse.localizedString(forStatusCode: response.statusCode)
            if response.statusCode == 401 {
                throw MapsAPIError.unauthorized(message: message, requestID: requestID)
            }
            throw MapsAPIError.server(
                status: response.statusCode,
                code: envelope?.error.code ?? "HTTP_\(response.statusCode)",
                message: message,
                requestID: requestID
            )
        }
    }
}

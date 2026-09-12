import Foundation

struct AppEnvironment {
    let api: any MapsAPI
    let credentials: any CredentialStoring
    let cache: any MapCaching

    static func current(arguments: [String] = ProcessInfo.processInfo.arguments) -> AppEnvironment {
        guard arguments.contains("-ui-testing") else {
            return AppEnvironment(
                api: MapsAPIClient(),
                credentials: KeychainCredentialStore(),
                cache: FileMapCache()
            )
        }

        let seeded = arguments.contains("-ui-seeded")
        return AppEnvironment(
            api: UITestMapsAPI(),
            credentials: InMemoryCredentialStore(key: seeded ? UITestMapsAPI.validKey : nil),
            cache: InMemoryMapCache()
        )
    }
}

actor UITestMapsAPI: MapsAPI {
    static let validKey = "synthetic-ui-key"

    private var maps: [LalGeoMap] = [
        LalGeoMap(
            id: "calgary_field_map",
            name: "Calgary Field Map",
            description: "Synthetic utility and access observations",
            center: MapCenter(latitude: 51.0447, longitude: -114.0719),
            zoom: 11,
            mapType: .standard,
            showBasemapPOIs: true,
            metadata: [:],
            createdAt: "2026-09-08T16:00:00.000Z",
            updatedAt: "2026-09-09T02:10:00.000Z"
        ),
        LalGeoMap(
            id: "foothills_inspection",
            name: "Foothills Inspection",
            description: "Synthetic readiness walk",
            center: MapCenter(latitude: 50.89, longitude: -114.12),
            zoom: 10,
            mapType: .hybrid,
            showBasemapPOIs: false,
            metadata: [:],
            createdAt: "2026-09-07T14:00:00.000Z",
            updatedAt: "2026-09-08T20:00:00.000Z"
        )
    ]

    func validate(apiKey: String) throws {
        guard apiKey == Self.validKey else {
            throw MapsAPIError.unauthorized(message: "The API key is invalid.", requestID: "synthetic-request")
        }
    }

    func listMaps(apiKey: String) throws -> [LalGeoMap] {
        try validate(apiKey: apiKey)
        return maps
    }

    func createMap(_ draft: MapDraft, apiKey: String) throws -> LalGeoMap {
        try validate(apiKey: apiKey)
        let created = LalGeoMap(
            id: draft.id,
            name: draft.name,
            description: draft.description,
            center: MapCenter(latitude: 51.0447, longitude: -114.0719),
            zoom: 10,
            mapType: draft.mapType,
            showBasemapPOIs: draft.showBasemapPOIs,
            metadata: [:],
            createdAt: "2026-09-09T03:00:00.000Z",
            updatedAt: "2026-09-09T03:00:00.000Z"
        )
        maps.insert(created, at: 0)
        return created
    }

    func getMap(id: String, apiKey: String) throws -> LalGeoMap {
        try validate(apiKey: apiKey)
        guard let map = maps.first(where: { $0.id == id }) else {
            throw MapsAPIError.server(status: 404, code: "MAP_NOT_FOUND", message: "Map not found.", requestID: "synthetic-request")
        }
        return map
    }

    func loadMapContents(mapID: String, apiKey: String) throws -> [LayerFeatures] {
        try validate(apiKey: apiKey)
        guard mapID == "calgary_field_map" else { return [] }

        let layer = MapLayer(
            id: "field_observations",
            mapID: mapID,
            name: "Field observations",
            geometryType: .point,
            style: [:],
            position: 0,
            createdAt: "2026-09-08T16:00:00.000Z",
            updatedAt: "2026-09-09T02:10:00.000Z"
        )
        let features = [
            GeoJSONFeature(
                type: "Feature",
                id: "central_library",
                geometry: GeoJSONGeometry(type: .point, coordinates: .array([.number(-114.0606), .number(51.0450)])),
                properties: ["name": .string("Central Library")],
                createdAt: nil,
                updatedAt: nil
            ),
            GeoJSONFeature(
                type: "Feature",
                id: "peace_bridge",
                geometry: GeoJSONGeometry(type: .point, coordinates: .array([.number(-114.0773), .number(51.0539), .number(1_045)])),
                properties: ["name": .string("Peace Bridge")],
                createdAt: nil,
                updatedAt: nil
            )
        ]
        return [LayerFeatures(layer: layer, features: features)]
    }

    func exportMap(id: String, apiKey: String) throws -> Data {
        try validate(apiKey: apiKey)
        guard let map = maps.first(where: { $0.id == id }) else {
            throw MapsAPIError.server(status: 404, code: "MAP_NOT_FOUND", message: "Map not found.", requestID: "synthetic-request")
        }
        let escapedName = map.name.replacingOccurrences(of: "\"", with: "\\\"")
        return Data("{\"project\":{\"id\":\"\(map.id)\",\"name\":\"\(escapedName)\",\"layers\":[{\"id\":\"empty_points\",\"name\":\"Points\",\"geometryType\":\"point\",\"selectable\":true,\"styleDefaults\":{},\"schema\":[],\"features\":[]}]},\"activeLayerId\":\"empty_points\",\"survey\":null}".utf8)
    }
}


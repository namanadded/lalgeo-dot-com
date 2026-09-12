import XCTest
@testable import LalGeoMaps

final class MapsAPIClientTests: XCTestCase {
    override func tearDown() {
        URLProtocolStub.handler = nil
        super.tearDown()
    }

    func testValidateUsesExactBearerHeaderAndBoundedProbe() async throws {
        let client = makeClient()
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer secret-key")
            let components = URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)
            XCTAssertEqual(components?.path, "/v1/maps")
            XCTAssertEqual(components?.queryItems?.first(where: { $0.name == "limit" })?.value, "1")
            return Self.response(for: request, body: Self.mapsPage(maps: [], limit: 1, offset: 0))
        }

        try await client.validate(apiKey: "secret-key")
    }

    func testListMapsFollowsPaginationUntilShortPage() async throws {
        let client = makeClient()
        URLProtocolStub.handler = { request in
            let components = URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)
            let offset = Int(components?.queryItems?.first(where: { $0.name == "offset" })?.value ?? "")
            if offset == 0 {
                return Self.response(for: request, body: Self.mapsPage(maps: (0 ..< 100).map { "map_\($0)" }, limit: 100, offset: 0))
            }
            return Self.response(for: request, body: Self.mapsPage(maps: ["map_100"], limit: 100, offset: 100))
        }

        let maps = try await client.listMaps(apiKey: "key")

        XCTAssertEqual(maps.count, 101)
        XCTAssertEqual(maps.last?.id, "map_100")
    }

    func testCreateUsesStableClientIDAndReconcilesLostResponse() async throws {
        let client = makeClient()
        let draft = MapDraft(id: "map_ios_stable", name: "Stable", description: "", mapType: .standard, showBasemapPOIs: true)
        var didFailPost = false
        URLProtocolStub.handler = { request in
            if request.httpMethod == "POST" {
                didFailPost = true
                let body = try XCTUnwrap(request.httpBody)
                let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["id"] as? String, "map_ios_stable")
                throw URLError(.networkConnectionLost)
            }
            XCTAssertTrue(didFailPost)
            XCTAssertEqual(request.url?.path, "/v1/maps/map_ios_stable")
            return Self.response(for: request, body: Data(#"{"map":{"id":"map_ios_stable","name":"Stable","description":"","center":null,"zoom":null,"map_type":"standard","show_basemap_pois":true,"metadata":{},"created_at":"2026-09-09T00:00:00Z","updated_at":"2026-09-09T00:00:00Z"}}"#.utf8))
        }

        let map = try await client.createMap(draft, apiKey: "key")

        XCTAssertEqual(map.id, draft.id)
    }

    func testUnauthorizedErrorKeepsRequestID() async {
        let client = makeClient()
        URLProtocolStub.handler = { request in
            Self.response(
                for: request,
                status: 401,
                body: Data(#"{"error":{"code":"UNAUTHORIZED","message":"The API key is invalid."},"request_id":"ray-123"}"#.utf8)
            )
        }

        do {
            try await client.validate(apiKey: "bad")
            XCTFail("Expected unauthorized error")
        } catch let error as MapsAPIError {
            XCTAssertTrue(error.isUnauthorized)
            XCTAssertEqual(error.requestID, "ray-123")
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testExportReturnsExactWrapperBytes() async throws {
        let client = makeClient()
        let export = Data(#"{"project":{"id":"map_1","layers":[]},"activeLayerId":null,"survey":null}"#.utf8)
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.path, "/v1/maps/map_1/export")
            return Self.response(for: request, body: export)
        }

        let received = try await client.exportMap(id: "map_1", apiKey: "key")

        XCTAssertEqual(received, export)
    }

    private func makeClient() -> MapsAPIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        return MapsAPIClient(baseURL: URL(string: "https://example.test")!, session: URLSession(configuration: configuration))
    }

    private static func response(for request: URLRequest, status: Int = 200, body: Data) -> (HTTPURLResponse, Data) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (response, body)
    }

    private static func mapsPage(maps ids: [String], limit: Int, offset: Int) -> Data {
        let maps = ids.map { id in
            [
                "id": id, "name": id, "description": "", "center": NSNull(), "zoom": NSNull(),
                "map_type": "standard", "show_basemap_pois": true, "metadata": [:],
                "created_at": "2026-09-09T00:00:00Z", "updated_at": "2026-09-09T00:00:00Z"
            ] as [String: Any]
        }
        return try! JSONSerialization.data(withJSONObject: [
            "maps": maps,
            "pagination": ["limit": limit, "offset": offset, "count": maps.count]
        ])
    }
}

private final class URLProtocolStub: URLProtocol {
    static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.unknown))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

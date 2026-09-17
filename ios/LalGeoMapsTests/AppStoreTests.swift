import XCTest
@testable import LalGeoMaps

@MainActor
final class AppStoreTests: XCTestCase {
    func testInvalidKeyIsNeverSaved() async {
        let api = TestMapsAPI(validateError: .unauthorized(message: "Invalid", requestID: "request-1"))
        let credentials = RecordingCredentialStore()
        let store = AppStore(api: api, credentials: credentials, cache: InMemoryMapCache())

        let connected = await store.connect(apiKey: "bad-key")
        let storedValue = await credentials.value()
        let saveCount = await credentials.saveCount()

        XCTAssertFalse(connected)
        XCTAssertEqual(store.sessionState, .restoring)
        XCTAssertNil(storedValue)
        XCTAssertEqual(saveCount, 0)
    }

    func testValidKeyIsSavedAfterValidationAndLoadsLibrary() async {
        let api = TestMapsAPI(maps: [Self.sampleMap])
        let credentials = RecordingCredentialStore()
        let store = AppStore(api: api, credentials: credentials, cache: InMemoryMapCache())

        let connected = await store.connect(apiKey: "  valid-key  ")
        let storedValue = await credentials.value()
        let validatedKeys = await api.validatedKeys()

        XCTAssertTrue(connected)
        XCTAssertEqual(store.sessionState, .signedIn)
        XCTAssertEqual(store.maps, [Self.sampleMap])
        XCTAssertEqual(storedValue, "valid-key")
        XCTAssertEqual(validatedKeys, ["valid-key"])
    }

    func testOfflineRestoreUsesExplicitReadOnlySnapshot() async {
        let credentials = RecordingCredentialStore(value: "stored-key")
        let cache = InMemoryMapCache(maps: [Self.sampleMap])
        let api = TestMapsAPI(listError: .offline)
        let store = AppStore(api: api, credentials: credentials, cache: cache)

        await store.start()

        XCTAssertEqual(store.sessionState, .signedIn)
        XCTAssertEqual(store.maps, [Self.sampleMap])
        XCTAssertTrue(store.isUsingOfflineSnapshot)
        XCTAssertEqual(store.notice?.title, "Showing saved maps")
    }

    func testUnauthorizedRestoreExpiresKeyAndCache() async {
        let credentials = RecordingCredentialStore(value: "expired-key")
        let cache = InMemoryMapCache(maps: [Self.sampleMap])
        let api = TestMapsAPI(listError: .unauthorized(message: "Expired", requestID: "request-2"))
        let store = AppStore(api: api, credentials: credentials, cache: cache)

        await store.start()
        let storedValue = await credentials.value()
        let cachedMaps = await cache.load()

        XCTAssertEqual(store.sessionState, .signedOut)
        XCTAssertNil(storedValue)
        XCTAssertEqual(cachedMaps, [])
        XCTAssertEqual(store.notice?.title, "API key needs attention")
    }

    func testCreateUsesContractSafeStableIDAndUpdatesCache() async {
        let api = TestMapsAPI(maps: [])
        let credentials = RecordingCredentialStore(value: "key")
        let cache = InMemoryMapCache()
        let store = AppStore(api: api, credentials: credentials, cache: cache)
        await store.start()

        let created = await store.createMap(name: " Field day ", description: " Synthetic ")
        let cachedMaps = await cache.load()

        XCTAssertEqual(created?.name, "Field day")
        XCTAssertTrue(created?.id.hasPrefix("map_ios_") == true)
        XCTAssertEqual(created?.id.count, 40)
        XCTAssertEqual(store.maps.first, created)
        XCTAssertEqual(cachedMaps, store.maps)
    }

    func testAddPointCreatesTypedLayerAndStoresGeoJSONCoordinates() async throws {
        let api = TestMapsAPI(maps: [Self.sampleMap])
        let store = AppStore(api: api, credentials: RecordingCredentialStore(value: "key"), cache: InMemoryMapCache())
        await store.start()
        let layerDraft = LayerDraft(id: "layer_ios_stable", name: "Site notes", geometryType: .point)
        let pointDraft = PointFeatureDraft(id: "feature_ios_stable", name: "Gate", latitude: 51.05, longitude: -114.07)

        let saved = try await store.addPoint(to: Self.sampleMap, layer: .new(layerDraft), draft: pointDraft)
        let contents = try await store.loadContents(for: Self.sampleMap)

        XCTAssertEqual(saved.id, pointDraft.id)
        XCTAssertEqual(saved.geometry.coordinates, .array([.number(-114.07), .number(51.05)]))
        XCTAssertEqual(contents.first?.layer.geometryType, .point)
        XCTAssertEqual(contents.first?.features.map(\.id), [pointDraft.id])
    }

    func testAddPointRejectsNonPointLayerBeforeWriting() async {
        let api = TestMapsAPI(maps: [Self.sampleMap])
        let store = AppStore(api: api, credentials: RecordingCredentialStore(value: "key"), cache: InMemoryMapCache())
        await store.start()
        let lineLayer = MapLayer(id: "line_1", mapID: Self.sampleMap.id, name: "Paths", geometryType: .lineString,
                                 style: [:], position: 0, createdAt: Self.sampleMap.createdAt, updatedAt: Self.sampleMap.updatedAt)
        let draft = PointFeatureDraft(id: "feature_ios_stable", name: "Gate", latitude: 51.05, longitude: -114.07)

        do {
            _ = try await store.addPoint(to: Self.sampleMap, layer: .existing(lineLayer), draft: draft)
            XCTFail("Expected a typed-layer validation error")
        } catch is PointEntryError {
            let contents = try? await store.loadContents(for: Self.sampleMap)
            XCTAssertEqual(contents, [])
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    private static let sampleMap = LalGeoMap(
        id: "map_1",
        name: "Sample",
        description: "Synthetic",
        center: nil,
        zoom: nil,
        mapType: .standard,
        showBasemapPOIs: true,
        metadata: [:],
        createdAt: "2026-09-09T00:00:00Z",
        updatedAt: "2026-09-09T00:00:00Z"
    )
}

private actor RecordingCredentialStore: CredentialStoring {
    private var storedValue: String?
    private var saves = 0

    init(value: String? = nil) { storedValue = value }

    func load() -> String? { storedValue }
    func save(_ apiKey: String) {
        storedValue = apiKey
        saves += 1
    }
    func delete() { storedValue = nil }
    func value() -> String? { storedValue }
    func saveCount() -> Int { saves }
}

private actor TestMapsAPI: MapsAPI {
    private var maps: [LalGeoMap]
    private var layersByMap: [String: [MapLayer]] = [:]
    private var featuresByLayer: [String: [GeoJSONFeature]] = [:]
    private let validateError: MapsAPIError?
    private let listError: MapsAPIError?
    private var validationHistory: [String] = []

    init(maps: [LalGeoMap] = [], validateError: MapsAPIError? = nil, listError: MapsAPIError? = nil) {
        self.maps = maps
        self.validateError = validateError
        self.listError = listError
    }

    func validate(apiKey: String) throws {
        validationHistory.append(apiKey)
        if let validateError { throw validateError }
    }

    func listMaps(apiKey: String) throws -> [LalGeoMap] {
        if let listError { throw listError }
        return maps
    }

    func createMap(_ draft: MapDraft, apiKey: String) -> LalGeoMap {
        let map = LalGeoMap(
            id: draft.id,
            name: draft.name,
            description: draft.description,
            center: nil,
            zoom: nil,
            mapType: draft.mapType,
            showBasemapPOIs: draft.showBasemapPOIs,
            metadata: [:],
            createdAt: "2026-09-09T00:00:00Z",
            updatedAt: "2026-09-09T00:00:00Z"
        )
        maps.insert(map, at: 0)
        return map
    }

    func getMap(id: String, apiKey: String) throws -> LalGeoMap {
        guard let map = maps.first(where: { $0.id == id }) else {
            throw MapsAPIError.server(status: 404, code: "MAP_NOT_FOUND", message: "Not found", requestID: nil)
        }
        return map
    }

    func loadMapContents(mapID: String, apiKey: String) -> [LayerFeatures] {
        (layersByMap[mapID] ?? []).map { LayerFeatures(layer: $0, features: featuresByLayer[$0.id] ?? []) }
    }
    func createLayer(_ draft: LayerDraft, mapID: String, apiKey: String) -> MapLayer {
        let layer = MapLayer(id: draft.id, mapID: mapID, name: draft.name, geometryType: draft.geometryType,
                             style: [:], position: 0, createdAt: "2026-09-09T00:00:00Z", updatedAt: "2026-09-09T00:00:00Z")
        layersByMap[mapID, default: []].append(layer)
        return layer
    }
    func createPoint(_ draft: PointFeatureDraft, mapID: String, layerID: String, apiKey: String) -> GeoJSONFeature {
        let feature = GeoJSONFeature(type: draft.type, id: draft.id, geometry: draft.geometry, properties: draft.properties,
                                     createdAt: nil, updatedAt: nil)
        featuresByLayer[layerID, default: []].append(feature)
        return feature
    }
    func exportMap(id: String, apiKey: String) -> Data { Data("{}".utf8) }
    func validatedKeys() -> [String] { validationHistory }
}

import Foundation

@MainActor
final class AppStore: ObservableObject {
    enum SessionState: Equatable {
        case restoring
        case signedOut
        case signedIn
    }

    struct Notice: Identifiable, Equatable {
        enum Kind { case information, error }

        let id = UUID()
        let kind: Kind
        let title: String
        let message: String

        static func == (lhs: Notice, rhs: Notice) -> Bool {
            lhs.kind == rhs.kind && lhs.title == rhs.title && lhs.message == rhs.message
        }
    }

    @Published private(set) var sessionState: SessionState = .restoring
    @Published private(set) var maps: [LalGeoMap] = []
    @Published private(set) var isRefreshing = false
    @Published private(set) var isUsingOfflineSnapshot = false
    @Published var notice: Notice?

    private let api: any MapsAPI
    private let credentials: any CredentialStoring
    private let cache: any MapCaching
    private var apiKey: String?
    private var hasStarted = false

    init(api: any MapsAPI, credentials: any CredentialStoring, cache: any MapCaching) {
        self.api = api
        self.credentials = credentials
        self.cache = cache
    }

    func start() async {
        guard !hasStarted else { return }
        hasStarted = true

        do {
            guard let storedKey = try await credentials.load(), !storedKey.isEmpty else {
                sessionState = .signedOut
                return
            }
            apiKey = storedKey
            sessionState = .signedIn
            await refresh()
        } catch {
            sessionState = .signedOut
            notice = Notice(kind: .error, title: "Secure storage unavailable", message: error.localizedDescription)
        }
    }

    func connect(apiKey candidate: String) async -> Bool {
        let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            notice = Notice(kind: .error, title: "API key required", message: "Paste the API key provided by your LalGeo administrator.")
            return false
        }

        do {
            try await api.validate(apiKey: trimmed)
            try await credentials.save(trimmed)
            try? await cache.clear()
            apiKey = trimmed
            sessionState = .signedIn
            await refresh()
            return sessionState == .signedIn
        } catch {
            notice = notice(for: error, title: "Couldn’t connect")
            return false
        }
    }

    func refresh() async {
        guard let apiKey, !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }

        do {
            let remoteMaps = try await api.listMaps(apiKey: apiKey)
            maps = remoteMaps
            isUsingOfflineSnapshot = false
            try? await cache.save(remoteMaps)
        } catch {
            if isUnauthorized(error) {
                await expireSession(error: error)
                return
            }

            let cachedMaps = (try? await cache.load()) ?? []
            if !cachedMaps.isEmpty {
                maps = cachedMaps
                isUsingOfflineSnapshot = true
                notice = Notice(
                    kind: .information,
                    title: "Showing saved maps",
                    message: "LalGeo couldn’t be reached. This catalog is read-only until the next successful refresh."
                )
            } else {
                notice = notice(for: error, title: "Couldn’t load API Maps")
            }
        }
    }

    func createMap(name: String, description: String) async -> LalGeoMap? {
        guard let apiKey else { return nil }
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            notice = Notice(kind: .error, title: "Map name required", message: "Give the new map a short, recognizable name.")
            return nil
        }
        guard trimmedName.utf16.count <= 200 else {
            notice = Notice(kind: .error, title: "Map name is too long", message: "Use 200 characters or fewer.")
            return nil
        }

        let draft = MapDraft(
            id: "map_ios_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())",
            name: trimmedName,
            description: description.trimmingCharacters(in: .whitespacesAndNewlines),
            mapType: .standard,
            showBasemapPOIs: true
        )

        do {
            let newMap = try await api.createMap(draft, apiKey: apiKey)
            maps.removeAll { $0.id == newMap.id }
            maps.insert(newMap, at: 0)
            isUsingOfflineSnapshot = false
            try? await cache.save(maps)
            return newMap
        } catch {
            if isUnauthorized(error) { await expireSession(error: error) }
            else { notice = notice(for: error, title: "Couldn’t create map") }
            return nil
        }
    }

    func loadContents(for map: LalGeoMap) async throws -> [LayerFeatures] {
        guard let apiKey else { throw MapsAPIError.unauthorized(message: "Connect to LalGeo again.", requestID: nil) }
        do {
            return try await api.loadMapContents(mapID: map.id, apiKey: apiKey)
        } catch {
            if isUnauthorized(error) { await expireSession(error: error) }
            throw error
        }
    }

    func exportPortableCopy(of map: LalGeoMap) async throws -> URL {
        guard let apiKey else { throw MapsAPIError.unauthorized(message: "Connect to LalGeo again.", requestID: nil) }
        do {
            let data = try await api.exportMap(id: map.id, apiKey: apiKey)
            return try ExportFileWriter.write(data: data, mapName: map.name)
        } catch {
            if isUnauthorized(error) { await expireSession(error: error) }
            throw error
        }
    }

    func disconnect() async {
        try? await credentials.delete()
        try? await cache.clear()
        apiKey = nil
        maps = []
        isUsingOfflineSnapshot = false
        notice = nil
        sessionState = .signedOut
    }

    private func expireSession(error: Error) async {
        try? await credentials.delete()
        try? await cache.clear()
        apiKey = nil
        maps = []
        isUsingOfflineSnapshot = false
        sessionState = .signedOut
        notice = notice(for: error, title: "API key needs attention")
    }

    private func isUnauthorized(_ error: Error) -> Bool {
        (error as? MapsAPIError)?.isUnauthorized == true
    }

    private func notice(for error: Error, title: String) -> Notice {
        let requestID = (error as? MapsAPIError)?.requestID
        let requestContext = requestID.map { "\n\nRequest ID: \($0)" } ?? ""
        return Notice(kind: .error, title: title, message: error.localizedDescription + requestContext)
    }
}


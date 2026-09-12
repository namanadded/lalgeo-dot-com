import Foundation

protocol MapCaching: Sendable {
    func load() async throws -> [LalGeoMap]
    func save(_ maps: [LalGeoMap]) async throws
    func clear() async throws
}

actor FileMapCache: MapCaching {
    private let fileURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(fileManager: FileManager = .default) {
        let root = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let directory = root.appendingPathComponent("LalGeoMaps", isDirectory: true)
        self.fileURL = directory.appendingPathComponent("api-maps-v1.json")
    }

    init(fileURL: URL) {
        self.fileURL = fileURL
    }

    func load() throws -> [LalGeoMap] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return [] }
        return try decoder.decode([LalGeoMap].self, from: Data(contentsOf: fileURL))
    }

    func save(_ maps: [LalGeoMap]) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDirectory = directory
        try? mutableDirectory.setResourceValues(values)
        try encoder.encode(maps).write(
            to: fileURL,
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        )
    }

    func clear() throws {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        try FileManager.default.removeItem(at: fileURL)
    }
}

actor InMemoryMapCache: MapCaching {
    private var maps: [LalGeoMap]

    init(maps: [LalGeoMap] = []) {
        self.maps = maps
    }

    func load() -> [LalGeoMap] { maps }
    func save(_ maps: [LalGeoMap]) { self.maps = maps }
    func clear() { maps = [] }
}

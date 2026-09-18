import Foundation

enum ExportFileWriter {
    static func write(data: Data, mapName: String, directory: URL = FileManager.default.temporaryDirectory) throws -> URL {
        let filename = sanitizedFilename(for: mapName)
        let url = directory.appendingPathComponent(filename).appendingPathExtension("lal")
        try data.write(to: url, options: [.atomic, .completeFileProtectionUnlessOpen])
        return url
    }

    static func sanitizedFilename(for mapName: String) -> String {
        let invalid = CharacterSet.alphanumerics
            .union(CharacterSet(charactersIn: "-_ "))
            .inverted
        let parts = mapName.components(separatedBy: invalid)
        let collapsed = parts.joined(separator: " ")
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let fallback = collapsed.isEmpty ? "LalGeo Map" : collapsed
        return String(fallback.prefix(80))
    }
}

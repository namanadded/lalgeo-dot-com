import CoreLocation
import Foundation

struct LalGeoMap: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let description: String
    let center: MapCenter?
    let zoom: Double?
    let mapType: MapType
    let showBasemapPOIs: Bool
    let metadata: [String: JSONValue]
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, name, description, center, zoom, metadata
        case mapType = "map_type"
        case showBasemapPOIs = "show_basemap_pois"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var updatedDate: Date? {
        Self.isoFormatter.date(from: updatedAt) ?? Self.fractionalISOFormatter.date(from: updatedAt)
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let fractionalISOFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

struct MapCenter: Codable, Hashable, Sendable {
    let latitude: Double
    let longitude: Double

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

enum MapType: String, Codable, CaseIterable, Sendable {
    case standard
    case satellite
    case hybrid
}

struct MapLayer: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let mapID: String
    let name: String
    let geometryType: GeometryType
    let style: [String: JSONValue]
    let position: Int
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, name, style, position
        case mapID = "map_id"
        case geometryType = "geometry_type"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

enum GeometryType: String, Codable, CaseIterable, Sendable {
    case point = "Point"
    case lineString = "LineString"
    case polygon = "Polygon"

    var symbolName: String {
        switch self {
        case .point: "mappin"
        case .lineString: "point.topleft.down.to.point.bottomright.curvepath"
        case .polygon: "pentagon"
        }
    }
}

struct GeoJSONFeature: Codable, Hashable, Identifiable, Sendable {
    let type: String
    let id: String
    let geometry: GeoJSONGeometry
    let properties: [String: JSONValue]
    let createdAt: String?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case type, id, geometry, properties
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var displayName: String {
        for key in ["name", "title", "label"] {
            if case let .string(value)? = properties[key], !value.isEmpty { return value }
        }
        return "Feature"
    }
}

struct GeoJSONGeometry: Codable, Hashable, Sendable {
    let type: GeometryType
    let coordinates: JSONValue

    var point: CLLocationCoordinate2D? {
        guard type == .point else { return nil }
        return Self.coordinate(from: coordinates)
    }

    var line: [CLLocationCoordinate2D]? {
        guard type == .lineString, case let .array(values) = coordinates else { return nil }
        let result = values.compactMap(Self.coordinate(from:))
        return result.count >= 2 ? result : nil
    }

    var outerRing: [CLLocationCoordinate2D]? {
        guard type == .polygon,
              case let .array(rings) = coordinates,
              case let .array(values)? = rings.first else { return nil }
        let result = values.compactMap(Self.coordinate(from:))
        return result.count >= 4 ? result : nil
    }

    private static func coordinate(from value: JSONValue) -> CLLocationCoordinate2D? {
        guard case let .array(parts) = value,
              parts.count >= 2,
              let longitude = parts[0].numberValue,
              let latitude = parts[1].numberValue,
              (-180 ... 180).contains(longitude),
              (-90 ... 90).contains(latitude) else { return nil }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

enum JSONValue: Codable, Hashable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([String: JSONValue].self) { self = .object(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .bool(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        case let .array(value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var numberValue: Double? {
        if case let .number(value) = self { return value }
        return nil
    }
}

struct MapsEnvelope: Decodable, Sendable {
    let maps: [LalGeoMap]
    let pagination: Pagination
}

struct MapEnvelope: Decodable, Sendable {
    let map: LalGeoMap
}

struct LayersEnvelope: Decodable, Sendable {
    let layers: [MapLayer]
}

struct FeatureCollection: Decodable, Sendable {
    let type: String
    let features: [GeoJSONFeature]
    let pagination: Pagination?
}

struct Pagination: Decodable, Sendable {
    let limit: Int
    let offset: Int
    let count: Int
}

struct MapDraft: Encodable, Sendable {
    let id: String
    let name: String
    let description: String
    let mapType: MapType
    let showBasemapPOIs: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, description
        case mapType = "map_type"
        case showBasemapPOIs = "show_basemap_pois"
    }
}

struct LayerDraft: Encodable, Sendable {
    let id: String
    let name: String
    let geometryType: GeometryType

    enum CodingKeys: String, CodingKey {
        case id, name
        case geometryType = "geometry_type"
    }
}

struct PointFeatureDraft: Encodable, Sendable {
    let type = "Feature"
    let id: String
    let geometry: GeoJSONGeometry
    let properties: [String: JSONValue]

    init(id: String, name: String, latitude: Double, longitude: Double) {
        self.id = id
        geometry = GeoJSONGeometry(type: .point, coordinates: .array([.number(longitude), .number(latitude)]))
        properties = ["name": .string(name)]
    }
}

enum PointLayerChoice: Sendable {
    case existing(MapLayer)
    case new(LayerDraft)
}

struct CreatedFeaturesEnvelope: Decodable, Sendable {
    let type: String
    let features: [GeoJSONFeature]
}

struct LayerEnvelope: Decodable, Sendable {
    let layer: MapLayer
}

struct LayerFeatures: Identifiable, Hashable, Sendable {
    let layer: MapLayer
    let features: [GeoJSONFeature]

    var id: String { layer.id }
}

struct APIErrorEnvelope: Decodable, Sendable {
    struct Body: Decodable, Sendable {
        let code: String
        let message: String
    }

    let error: Body
    let requestID: String

    enum CodingKeys: String, CodingKey {
        case error
        case requestID = "request_id"
    }
}

enum MapsAPIError: LocalizedError, Equatable, Sendable {
    case unauthorized(message: String, requestID: String?)
    case server(status: Int, code: String, message: String, requestID: String?)
    case invalidResponse
    case offline
    case transport(String)

    var errorDescription: String? {
        switch self {
        case let .unauthorized(message, _): message
        case let .server(_, _, message, _): message
        case .invalidResponse: "LalGeo returned an unreadable response. Please try again."
        case .offline: "You appear to be offline. Check your connection and try again."
        case let .transport(message): message
        }
    }

    var requestID: String? {
        switch self {
        case let .unauthorized(_, requestID), let .server(_, _, _, requestID): requestID
        case .invalidResponse, .offline, .transport: nil
        }
    }

    var isUnauthorized: Bool {
        if case .unauthorized = self { return true }
        return false
    }
}

import CoreLocation
import XCTest
@testable import LalGeoMaps

final class APIModelsTests: XCTestCase {
    func testMapDecodesNullableViewNestedMetadataAndFractionalDate() throws {
        let data = Data(#"""
        {
          "id":"map_1","name":"Field Map","description":"","center":null,"zoom":null,
          "map_type":"hybrid","show_basemap_pois":false,
          "metadata":{"nested":{"count":2},"tags":["field",null]},
          "created_at":"2026-09-09T02:10:00.125Z","updated_at":"2026-09-09T02:10:00.125Z"
        }
        """#.utf8)

        let map = try JSONDecoder().decode(LalGeoMap.self, from: data)

        XCTAssertEqual(map.id, "map_1")
        XCTAssertNil(map.center)
        XCTAssertNil(map.zoom)
        XCTAssertEqual(map.mapType, .hybrid)
        XCTAssertFalse(map.showBasemapPOIs)
        XCTAssertNotNil(map.updatedDate)
        XCTAssertEqual(map.metadata["nested"], .object(["count": .number(2)]))
    }

    func testGeoJSONGeometryPreservesAltitudeAndHydratesAllSupportedShapes() throws {
        let data = Data(#"""
        [
          {"type":"Point","coordinates":[-114.06,51.04,1045]},
          {"type":"LineString","coordinates":[[-114.1,51],[-114,51.1]]},
          {"type":"Polygon","coordinates":[[[-114.1,51],[-114,51],[-114,51.1],[-114.1,51]]]}
        ]
        """#.utf8)

        let geometries = try JSONDecoder().decode([GeoJSONGeometry].self, from: data)

        let point = try XCTUnwrap(geometries[0].point)
        XCTAssertEqual(point.latitude, 51.04, accuracy: 0.000_001)
        if case let .array(parts) = geometries[0].coordinates {
            XCTAssertEqual(parts[2], .number(1045))
        } else {
            XCTFail("Point coordinates were not preserved")
        }
        XCTAssertEqual(geometries[1].line?.count, 2)
        XCTAssertEqual(geometries[2].outerRing?.count, 4)
    }

    func testExportFilenameIsPortableAndBounded() {
        XCTAssertEqual(ExportFileWriter.sanitizedFilename(for: "  Calgary / Field:Map?  "), "Calgary Field Map")
        XCTAssertEqual(ExportFileWriter.sanitizedFilename(for: "///"), "LalGeo Map")
        XCTAssertEqual(ExportFileWriter.sanitizedFilename(for: String(repeating: "a", count: 120)).count, 80)
    }
}

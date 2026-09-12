import MapKit
import SwiftUI

struct MapCanvas: View {
    @State private var position: MapCameraPosition

    let map: LalGeoMap
    let contents: [LayerFeatures]

    init(map: LalGeoMap, contents: [LayerFeatures]) {
        self.map = map
        self.contents = contents
        if let center = map.center {
            let span = Self.span(forZoom: map.zoom)
            _position = State(initialValue: .region(MKCoordinateRegion(
                center: center.coordinate,
                span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)
            )))
        } else {
            _position = State(initialValue: .automatic)
        }
    }

    var body: some View {
        styledMap
            .mapControls {
                MapCompass()
                MapScaleView()
            }
            .overlay(alignment: .bottomLeading) {
                if contents.isEmpty {
                    Text("Map preview")
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.regularMaterial, in: Capsule())
                        .padding(12)
                        .accessibilityHidden(true)
                }
            }
    }

    @ViewBuilder
    private var styledMap: some View {
        switch map.mapType {
        case .standard:
            baseMap.mapStyle(.standard)
        case .satellite:
            baseMap.mapStyle(.imagery)
        case .hybrid:
            baseMap.mapStyle(.hybrid)
        }
    }

    private var baseMap: some View {
        Map(position: $position) {
            ForEach(points) { point in
                Annotation(point.name, coordinate: point.coordinate) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.title2)
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, Color.accentColor)
                        .shadow(radius: 2, y: 1)
                        .accessibilityLabel(point.name)
                }
            }

            ForEach(lines) { line in
                MapPolyline(coordinates: line.coordinates)
                    .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
            }

            ForEach(polygons) { polygon in
                MapPolygon(coordinates: polygon.coordinates)
                    .foregroundStyle(Color.accentColor.opacity(0.18))
                    .stroke(Color.accentColor, lineWidth: 2)
            }
        }
    }

    private var points: [PointItem] {
        contents.flatMap { content in
            content.features.compactMap { feature in
                guard let coordinate = feature.geometry.point else { return nil }
                return PointItem(
                    id: "\(content.layer.id)/\(feature.id)",
                    name: feature.displayName,
                    latitude: coordinate.latitude,
                    longitude: coordinate.longitude
                )
            }
        }
    }

    private var lines: [ShapeItem] {
        contents.flatMap { content in
            content.features.compactMap { feature in
                guard let coordinates = feature.geometry.line else { return nil }
                return ShapeItem(id: "\(content.layer.id)/\(feature.id)", coordinates: coordinates)
            }
        }
    }

    private var polygons: [ShapeItem] {
        contents.flatMap { content in
            content.features.compactMap { feature in
                guard let coordinates = feature.geometry.outerRing else { return nil }
                return ShapeItem(id: "\(content.layer.id)/\(feature.id)", coordinates: coordinates)
            }
        }
    }

    private static func span(forZoom zoom: Double?) -> Double {
        guard let zoom else { return 0.25 }
        return min(max(360 / pow(2, zoom), 0.002), 120)
    }
}

private struct PointItem: Identifiable {
    let id: String
    let name: String
    let latitude: Double
    let longitude: Double

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

private struct ShapeItem: Identifiable {
    let id: String
    let coordinates: [CLLocationCoordinate2D]
}


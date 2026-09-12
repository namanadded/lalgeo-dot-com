import SwiftUI

struct ConnectView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL
    @State private var apiKey = ""
    @State private var isConnecting = false
    @FocusState private var keyFieldFocused: Bool

    private let developerGuide = URL(string: "https://lalgeo.com/developers/")!

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Spacer(minLength: 30)

                    VStack(alignment: .leading, spacing: 14) {
                        Image(systemName: "map.fill")
                            .font(.system(size: 42, weight: .semibold))
                            .foregroundStyle(.tint)
                            .accessibilityHidden(true)

                        Text("Your LalGeo maps, in the field")
                            .font(.largeTitle.bold())
                            .accessibilityIdentifier("connectHeading")

                        Text("Connect to your owner-scoped API Maps. Browse, create, preview, and share portable copies from a native app.")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("API key")
                            .font(.headline)
                        SecureField("Paste your API key", text: $apiKey)
                            .textContentType(.password)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .submitLabel(.continue)
                            .focused($keyFieldFocused)
                            .padding(14)
                            .background(.background, in: RoundedRectangle(cornerRadius: 12))
                            .overlay {
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(.separator, lineWidth: 1)
                            }
                            .accessibilityIdentifier("apiKeyField")
                            .onSubmit { Task { await connect() } }

                        Text("The key is validated before it is saved, then stored in this device’s Keychain. LalGeo never places it in links or app logs.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    Button {
                        Task { await connect() }
                    } label: {
                        HStack {
                            if isConnecting { ProgressView().tint(.white) }
                            Text(isConnecting ? "Connecting…" : "Connect to LalGeo")
                                .frame(maxWidth: .infinity)
                        }
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(isConnecting || apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("connectButton")

                    Button("API keys and developer guide") {
                        openURL(developerGuide)
                    }
                    .font(.subheadline)

                    Spacer(minLength: 20)
                }
                .frame(maxWidth: 560, alignment: .leading)
                .padding(.horizontal, 24)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("LalGeo Maps")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func connect() async {
        guard !isConnecting else { return }
        isConnecting = true
        defer { isConnecting = false }
        if await store.connect(apiKey: apiKey) {
            apiKey = ""
            keyFieldFocused = false
        }
    }
}


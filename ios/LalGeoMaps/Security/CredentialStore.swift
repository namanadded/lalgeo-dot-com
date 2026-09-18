import Foundation
import Security

protocol CredentialStoring: Sendable {
    func load() async throws -> String?
    func save(_ apiKey: String) async throws
    func delete() async throws
}

struct KeychainCredentialStore: CredentialStoring, Sendable {
    private let service = "com.lalgeo.maps.api"
    private let account = "production-api-key"

    func load() async throws -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let key = String(data: data, encoding: .utf8) else {
            throw CredentialStoreError.keychain(status)
        }
        return key
    }

    func save(_ apiKey: String) async throws {
        try await delete()
        var query = baseQuery
        query[kSecValueData as String] = Data(apiKey.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw CredentialStoreError.keychain(status) }
    }

    func delete() async throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw CredentialStoreError.keychain(status)
        }
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: false
        ]
    }
}

enum CredentialStoreError: LocalizedError {
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case let .keychain(status):
            let detail = SecCopyErrorMessageString(status, nil) as String? ?? "Unknown Keychain error"
            return "The API key couldn’t be saved securely. \(detail)"
        }
    }
}

actor InMemoryCredentialStore: CredentialStoring {
    private var key: String?

    init(key: String? = nil) {
        self.key = key
    }

    func load() -> String? { key }
    func save(_ apiKey: String) { key = apiKey }
    func delete() { key = nil }
}


import XCTest

final class LalGeoMapsUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testConnectCreateAndOpenMapJourney() {
        let app = launch()
        XCTAssertTrue(app.staticTexts["connectHeading"].waitForExistence(timeout: 5))

        let keyField = app.secureTextFields["apiKeyField"]
        keyField.tap()
        keyField.typeText("synthetic-ui-key")
        app.buttons["connectButton"].tap()

        XCTAssertTrue(app.navigationBars["API Maps"].waitForExistence(timeout: 5))
        app.buttons["createMapButton"].tap()

        let nameField = app.textFields["mapNameField"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 3))
        nameField.typeText("Synthetic Site Walk")
        app.buttons["confirmCreateMapButton"].tap()

        XCTAssertTrue(app.navigationBars["Synthetic Site Walk"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["nativeMapPreview"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["emptyLayersState"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["sharePortableCopyButton"].exists)
    }

    func testInvalidKeyExplainsRecoveryWithoutLeavingSetup() {
        let app = launch()
        let keyField = app.secureTextFields["apiKeyField"]
        XCTAssertTrue(keyField.waitForExistence(timeout: 5))
        keyField.tap()
        keyField.typeText("wrong-key")
        app.buttons["connectButton"].tap()

        XCTAssertTrue(app.alerts["Couldn’t connect"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.alerts["Couldn’t connect"].staticTexts["The API key is invalid.\n\nRequest ID: synthetic-request"].exists)
        app.alerts["Couldn’t connect"].buttons["OK"].tap()
        XCTAssertTrue(app.staticTexts["connectHeading"].exists)
    }

    func testSeededLibraryAndTypedPreviewAreAccessible() throws {
        let app = launch(seeded: true)
        XCTAssertTrue(app.navigationBars["API Maps"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Calgary Field Map"].exists)
        XCTAssertTrue(app.staticTexts["Foothills Inspection"].exists)

        try app.performAccessibilityAudit()

        app.staticTexts["Calgary Field Map"].tap()
        XCTAssertTrue(app.navigationBars["Calgary Field Map"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["2 features · Point"].waitForExistence(timeout: 5))

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "calgary-map-detail"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func launch(seeded: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"] + (seeded ? ["-ui-seeded"] : [])
        app.launch()
        return app
    }
}

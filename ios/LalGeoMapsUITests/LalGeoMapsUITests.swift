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
        app.swipeUp()
        XCTAssertTrue(app.descendants(matching: .any)["emptyLayersState"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["sharePortableCopyButton"].exists)

        app.buttons["addPointButton"].tap()
        XCTAssertTrue(app.navigationBars["Add point"].waitForExistence(timeout: 3))
        attachScreenshot(of: app, named: "add-point-form")
        let pointName = app.textFields["pointNameField"]
        pointName.tap()
        pointName.typeText("Synthetic gate")
        let latitude = app.textFields["pointLatitudeField"]
        latitude.tap()
        latitude.typeText("51.05")
        let longitude = app.textFields["pointLongitudeField"]
        longitude.tap()
        longitude.typeText("-114.07")
        app.buttons["savePointButton"].tap()

        XCTAssertTrue(app.staticTexts["1 feature · Point"].waitForExistence(timeout: 5))
        attachScreenshot(of: app, named: "authored-point-map-detail")
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
        attachScreenshot(of: app, named: "seeded-map-library")

        try app.performAccessibilityAudit()

        app.staticTexts["Calgary Field Map"].tap()
        XCTAssertTrue(app.navigationBars["Calgary Field Map"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["2 features · Point"].waitForExistence(timeout: 5))

        attachScreenshot(of: app, named: "calgary-map-detail")
    }

    private func attachScreenshot(of app: XCUIApplication, named name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
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

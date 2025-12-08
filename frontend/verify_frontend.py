from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app (Runs on port 3000 as per vite.config.ts)
        try:
            page.goto("http://localhost:3000", timeout=15000)
            print("Navigated to app")
        except Exception as e:
            print(f"Failed to navigate: {e}")
            return

        # Wait for canvas to load
        try:
            page.wait_for_selector("canvas", timeout=5000)
            print("Canvas loaded")
        except:
             print("Canvas not found")

        # 1. Verify UI Layout changes
        # Check Ribbon layout - we expect "Camadas" dropdown button
        try:
             layers_btn = page.locator("text=Camada")
             if layers_btn.count() > 0:
                 print("Layer dropdown found")
             else:
                 print("Layer dropdown NOT found")
        except:
             print("Error checking layer dropdown")

        # 2. Verify Text Tool interaction (Visual)
        # Select Text Tool
        try:
            # Click on Text tool icon (assuming generic locator or title)
            # In our code, title="Texto"
            text_tool_btn = page.locator("button[title='Texto']")
            if text_tool_btn.count() > 0:
                text_tool_btn.click()
                print("Clicked Text Tool")

                # Click on Canvas to start editing
                page.mouse.click(400, 300)
                print("Clicked on Canvas")

                # Check if contenteditable appears
                # It has style border: 1px dashed #3b82f6
                # And is a div
                # We can check for the element style or class
                # It is an unnamed div with contenteditable attribute
                editor = page.locator("div[contenteditable='true']")
                editor.wait_for(state='visible', timeout=2000)
                print("Text Editor appeared")

                # Type something
                editor.type("Hello Rich Text")
                print("Typed text")
            else:
                print("Text Tool button not found")
        except Exception as e:
            print(f"Error with Text Tool: {e}")

        # 3. Verify Layer Manager Open
        try:
            # Click Settings/Layer Manager button in ribbon
            layer_manager_btn = page.locator("button[title='Gerenciador de Camadas']")
            if layer_manager_btn.count() > 0:
                layer_manager_btn.click()
                print("Clicked Layer Manager")
                page.wait_for_selector("text=Gerenciador de Camadas", timeout=2000)
                print("Layer Manager Modal Opened")
        except Exception as e:
            print(f"Error with Layer Manager: {e}")

        # 4. Take Screenshot
        page.screenshot(path="verification_snapshot.png")
        print("Screenshot saved to verification_snapshot.png")

        browser.close()

if __name__ == "__main__":
    verify_changes()

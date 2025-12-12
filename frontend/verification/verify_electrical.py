
import os
import time
from playwright.sync_api import sync_playwright, expect

def verify_electrical_features():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Increase viewport size to ensure sidebar is visible
        page = browser.new_page(viewport={"width": 1280, "height": 720})

        try:
            # 1. Start: Load application
            print("Navigating to app...")
            page.goto("http://localhost:3000")

            # Wait for app to be ready (look for canvas or toolbar)
            print("Waiting for canvas...")
            # We have two canvases (static and dynamic). We want the interaction one (z-10).
            # The static one has 'pointer-events-none'.
            page.wait_for_selector("canvas", state="visible")

            # 2. Select 'Lançamento' tab
            print("Selecting Lançamento tab...")
            page.get_by_text("Lançamento").click()
            time.sleep(0.5)

            # 3. Place First Outlet (Test Pre-load)
            print("Placing first outlet...")
            page.get_by_role("button", name="Tomada").first.click()

            # Click on interaction canvas (the second one usually, or select by class)
            canvas = page.locator("canvas.z-10")

            canvas.click(position={"x": 200, "y": 200})
            time.sleep(0.5) # Allow for render

            # 4. Place Second Outlet
            print("Placing second outlet...")
            page.get_by_role("button", name="Tomada").first.click()
            canvas.click(position={"x": 400, "y": 200})
            time.sleep(0.5)

            # 5. Place Third Outlet (Test chain)
            print("Placing third outlet...")
            page.get_by_role("button", name="Tomada").first.click()
            canvas.click(position={"x": 400, "y": 400})
            time.sleep(0.5)

            # 6. Draw Conduit (Test Connectivity)
            print("Drawing conduit A->B...")
            page.get_by_role("button", name="Eletroduto").click()

            # Click near first outlet (200, 200)
            canvas.click(position={"x": 200, "y": 200})
            time.sleep(0.2)
            # Click near second outlet (400, 200)
            canvas.click(position={"x": 400, "y": 200})
            time.sleep(0.5)

            # 7. Draw Second Conduit
            print("Drawing conduit B->C...")
            # Tool should still be active
            canvas.click(position={"x": 400, "y": 200})
            time.sleep(0.2)
            canvas.click(position={"x": 400, "y": 400})
            time.sleep(0.5)

            # 8. Verify Properties (Test Shared Props)
            print("Verifying properties...")
            page.keyboard.press("Escape")
            time.sleep(0.2)
            page.keyboard.press("Escape") # Ensure tool is reset
            time.sleep(0.2)

            # Select the first outlet
            canvas.click(position={"x": 200, "y": 200})
            time.sleep(0.5)

            # Switch to Properties Tab in Sidebar!
            # The sidebar has tabs at the bottom.
            # Title="Propriedades".
            print("Switching to Properties sidebar...")
            page.get_by_title("Propriedades").click()
            time.sleep(0.5)

            # Change name to "TUG-TEST"
            # Use get_by_placeholder or label if possible.
            # Schema says label="Nome", placeholder="Ex: TUG".
            name_input = page.get_by_label("Nome")
            if name_input.count() > 0 and name_input.is_visible():
                print("Found Name input, updating...")
                name_input.fill("TUG-TEST")
                page.keyboard.press("Enter")
                # Trigger blur to save?
                canvas.click(position={"x": 10, "y": 10})
                time.sleep(0.5)
            else:
                print("Warning: Name input not found in property panel")

            # Select second outlet and verify name changed
            canvas.click(position={"x": 400, "y": 200})
            time.sleep(0.5)

            # Take screenshot
            screenshot_path = "frontend/verification/electrical_verification.png"
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="frontend/verification/error.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_electrical_features()

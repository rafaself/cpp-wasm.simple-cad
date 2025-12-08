
import os
import sys
from playwright.sync_api import sync_playwright

def verify_canvas_fix(page):
    # Navigate to the app
    # Using relative path assuming we run from repo root
    # Adjust port/url if necessary. The memory says port 3000.
    page.goto("http://localhost:3000")

    # Wait for canvas to load
    page.wait_for_selector("canvas")

    # 1. Select Text Tool
    # Assuming there's a button or way to select tool.
    # From code reading: `uiStore.setTool('text')`
    # We might need to click the UI. I don't know the exact UI selectors for tools.
    # I'll check `EditorRibbon.tsx` or similar if I can.
    # But for now, let's try to assume there are buttons with titles or text.

    # Let's verify by clicking on canvas to add text?
    # Or just injecting script to set state if UI is hard to click.
    # But Playwright should interact with UI.

    # Let's take a screenshot of initial state
    page.screenshot(path="frontend/verification/initial_state.png")

    # Try to find Text tool button
    # Searching for "Texto" or "Text"
    try:
        page.get_by_role("button", name="Texto").click()
    except:
        print("Could not find Text button by role. Trying alternate locators...")
        # Maybe use icon title?
        page.locator("[title='Texto']").click()

    # 2. Click on Canvas to start text entry
    canvas = page.locator("canvas").first
    box = canvas.bounding_box()
    center_x = box['x'] + box['width'] / 2
    center_y = box['y'] + box['height'] / 2

    page.mouse.click(center_x, center_y)

    # 3. Type "Hello World"
    # A textarea should appear
    page.locator("textarea").fill("Hello World")

    # 4. Exit edit mode (Click outside or ESC)
    # Click outside (at 0,0 relative to canvas?)
    page.mouse.click(box['x'] + 10, box['y'] + 10)

    # 5. Select Selection Tool
    try:
        page.get_by_role("button", name="Selecionar").click()
    except:
        page.locator("[title='Selecionar']").click()

    # 6. Click on the text (center)
    # This triggers the bug
    page.mouse.click(center_x, center_y)

    # Wait a bit
    page.wait_for_timeout(500)

    # 7. Take screenshot
    # If the bug is fixed, we should see the text selected and the grid.
    # If the bug persists, the canvas will be blank.
    page.screenshot(path="frontend/verification/after_selection.png")
    print("Verification script finished.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_canvas_fix(page)
        except Exception as e:
            print(f"Error: {e}")
            # Take screenshot on error
            page.screenshot(path="frontend/verification/error.png")
        finally:
            browser.close()

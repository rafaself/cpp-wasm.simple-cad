from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000")

        # Wait for app to load (look for canvas or sidebar)
        try:
            page.wait_for_selector("canvas", timeout=20000)
        except:
            print("Canvas not found")
            page.screenshot(path="verification/error_load.png")
            browser.close()
            return

        print("Canvas loaded")

        # Try to switch to "Desenho" tab if needed, but assuming default is ok or text tool is available.
        # Find Text Tool.
        # Check for button with 'Texto'

        found = False
        # Try aria-label or title
        for selector in ['button[title="Texto"]', 'button[aria-label="Texto"]', 'button:has-text("Texto")']:
            if page.locator(selector).count() > 0:
                page.locator(selector).first.click()
                print(f"Clicked {selector}")
                found = True
                break

        if not found:
            print("Text tool not found. Dumping buttons...")
            # buttons = page.locator("button").all_inner_texts()
            # print(buttons)
            page.screenshot(path="verification/ui_debug.png")
            # Continue anyway? No point.
            browser.close()
            return

        time.sleep(1)

        # Click on canvas center
        canvas = page.locator("canvas").first
        box = canvas.bounding_box()
        if not box:
            print("Canvas has no box")
            browser.close()
            return

        cx = box['x'] + box['width'] / 2
        cy = box['y'] + box['height'] / 2

        print(f"Clicking at {cx}, {cy}")
        page.mouse.click(cx, cy)
        time.sleep(0.5)

        # Type
        print("Typing...")
        page.keyboard.type("Test Input")
        time.sleep(1)

        page.screenshot(path="verification/verification.png")
        print("Screenshot saved to verification/verification.png")

        browser.close()

if __name__ == "__main__":
    run()

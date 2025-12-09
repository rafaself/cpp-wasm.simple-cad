from playwright.sync_api import sync_playwright

def verify_canvas(page):
    page.goto("http://localhost:3000")

    # Wait for the canvas to load
    page.wait_for_selector("canvas")

    # Verify 'Text' tool is NOT present in the ribbon
    # We look for the button with name="Texto" or title="Texto"
    # It should NOT exist.

    try:
        page.locator("button[title='Texto']").wait_for(state="visible", timeout=2000)
        print("FAIL: Text tool button found!")
    except:
        print("SUCCESS: Text tool button not found.")

    # Take a screenshot
    page.screenshot(path="frontend/verification/canvas_verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            verify_canvas(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

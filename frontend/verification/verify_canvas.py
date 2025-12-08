from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # 1. Open the editor
    print("Navigating to app...")
    page.goto("http://localhost:3000")

    # 2. Wait for loading
    page.wait_for_timeout(5000)

    # Wait for canvas explicitly
    print("Waiting for canvas...")
    try:
        page.wait_for_selector("canvas", timeout=10000)
    except:
        print("Canvas not found! Taking screenshot of what we see.")
        page.screenshot(path="frontend/verification/debug_not_found.png")
        browser.close()
        return

    # 3. Create a rectangle (Click Draw Rect -> Drag on Canvas)
    print("Selecting Rect Tool...")
    page.keyboard.press("r")

    # Drag on canvas
    canvas = page.locator("canvas").first
    box = canvas.bounding_box()

    if box:
        print(f"Canvas found at {box}")
        start_x = box['x'] + 100
        start_y = box['y'] + 100

        # Draw Rect
        page.mouse.move(start_x, start_y)
        page.mouse.down()
        page.mouse.move(start_x + 200, start_y + 150)
        page.mouse.up()
        print("Rectangle drawn.")

        # 4. Select it
        page.keyboard.press("v") # Select tool
        page.mouse.click(start_x + 100, start_y + 75)
        print("Rectangle selected.")

        page.wait_for_timeout(500)
        page.screenshot(path="frontend/verification/canvas_verification.png")
        print("Screenshot saved.")
    else:
        print("Canvas not found")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)

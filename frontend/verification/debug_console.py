from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # Capture console logs
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
    page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

    # 1. Open the editor
    print("Navigating to app...")
    page.goto("http://localhost:3000")

    # 2. Wait for loading
    try:
        page.wait_for_selector("canvas", timeout=5000)
        print("Canvas found.")
    except:
        print("Canvas not found. Checking if root exists...")
        if page.locator("#root").count() > 0:
            print("#root exists.")
        else:
            print("#root missing.")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)

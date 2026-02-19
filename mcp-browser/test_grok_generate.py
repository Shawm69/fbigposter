"""Test: generate one image on Grok to see the post-generation DOM and download flow."""

import asyncio
from playwright.async_api import async_playwright
from pathlib import Path


async def test():
    pw = await async_playwright().start()
    user_data = Path.home() / ".smi-browser"

    ctx = await pw.chromium.launch_persistent_context(
        user_data_dir=str(user_data),
        headless=False,
        viewport={"width": 1280, "height": 900},
        args=["--disable-blink-features=AutomationControlled"],
    )

    page = await ctx.new_page()
    await page.goto("https://grok.com/imagine", wait_until="domcontentloaded")
    await asyncio.sleep(5)

    # Type a simple prompt into the contenteditable
    editor = await page.query_selector('[contenteditable="true"]')
    if not editor:
        print("ERROR: No contenteditable found")
        return

    await editor.click()
    await editor.fill("")
    # Use keyboard.type instead of fill for contenteditable
    await page.keyboard.type("a golden sunset over calm ocean waves, photorealistic")
    await asyncio.sleep(1)

    print("Typed prompt. Clicking submit...")

    # Click submit
    submit = await page.query_selector('button[aria-label="Submit"]')
    if submit:
        await submit.click()
    else:
        print("ERROR: No submit button found")
        return

    print("Submitted. Waiting for generation...")

    # Poll for new images to appear
    # Before: count existing images with alt="Generated image"
    initial_imgs = await page.query_selector_all('img[alt="Generated image"]')
    initial_count = len(initial_imgs)
    print(f"Initial generated images: {initial_count}")

    for i in range(30):  # Poll for up to 90s
        await asyncio.sleep(3)
        current_imgs = await page.query_selector_all('img[alt="Generated image"]')
        current_count = len(current_imgs)
        print(f"  Poll {i+1}: {current_count} images (was {initial_count})")

        if current_count > initial_count:
            print("New image(s) appeared!")

            # Get the new image(s)
            for img in current_imgs[initial_count:]:
                src = await img.get_attribute("src")
                box = await img.bounding_box()
                w = box["width"] if box else 0
                h = box["height"] if box else 0
                print(f"  New image: {w}x{h} src={src[:100]}")

            # Take screenshot of the result
            await page.screenshot(path="screenshot_grok_result.png")

            # Now click on the first new image to see if there's a detail/download view
            new_img = current_imgs[initial_count]
            print("\nClicking on the generated image...")
            await new_img.click()
            await asyncio.sleep(3)
            await page.screenshot(path="screenshot_grok_detail.png")

            # Probe for download buttons, share buttons, three-dot menus
            probe_sels = [
                ("button:Download", 'button:has-text("Download")'),
                ("a:Download", 'a:has-text("Download")'),
                ("button:Save", 'button:has-text("Save")'),
                ("button:Share", 'button:has-text("Share")'),
                ("button:More", 'button[aria-label="More"]'),
                ("button:MoreOptions", 'button[aria-label="More options"]'),
                ("button:3dots", 'button:has-text("...")'),
                ("a[download]", "a[download]"),
                ("svg-download", 'button svg'),
            ]

            print("\n=== POST-CLICK SELECTOR PROBE ===")
            all_buttons = await page.query_selector_all("button")
            print(f"Total buttons after click: {len(all_buttons)}")
            for btn in all_buttons:
                text = await btn.evaluate("e => (e.innerText || '').trim()")
                aria = await btn.get_attribute("aria-label") or ""
                if text or aria:
                    print(f"  button: text='{text[:50]}' aria='{aria}'")

            for label, sel in probe_sels:
                el = await page.query_selector(sel)
                if el:
                    print(f"  FOUND: {label}")

            break
    else:
        print("Timed out waiting for generation.")
        await page.screenshot(path="screenshot_grok_timeout.png")

    print("\nBrowser stays open 30 seconds...")
    await asyncio.sleep(30)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())

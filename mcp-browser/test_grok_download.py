"""Test: focus on the download mechanism from Grok's detail view."""

import asyncio
from pathlib import Path
from playwright.async_api import async_playwright


async def test():
    pw = await async_playwright().start()
    user_data = Path.home() / ".smi-browser"

    ctx = await pw.chromium.launch_persistent_context(
        user_data_dir=str(user_data),
        headless=False,
        viewport={"width": 1280, "height": 900},
        accept_downloads=True,
        args=["--disable-blink-features=AutomationControlled"],
    )

    page = await ctx.new_page()
    await page.goto("https://grok.com/imagine", wait_until="domcontentloaded")
    await asyncio.sleep(5)

    # Submit prompt
    editor = await page.query_selector('[contenteditable="true"]')
    await editor.click()
    await page.keyboard.press("Control+a")
    await page.keyboard.press("Backspace")
    await page.keyboard.type("a majestic eagle soaring over mountains at dawn", delay=10)
    await asyncio.sleep(0.5)

    submit = await page.query_selector('button[aria-label="Submit"]')
    await submit.click()
    print("Submitted. Waiting 25s for full-res generation...")
    await asyncio.sleep(25)

    # Check image sizes
    imgs = await page.query_selector_all('img[alt="Generated image"]')
    print(f"Found {len(imgs)} generated images")
    for i, img in enumerate(imgs[:3]):
        src = await img.get_attribute("src") or ""
        print(f"  img[{i}] src length: {len(src)}")

    # Click first tile
    if imgs:
        box = await imgs[0].bounding_box()
        if box:
            await page.mouse.click(box["x"] + box["width"]/2, box["y"] + box["height"]/2)
            print("Clicked first tile")
            await asyncio.sleep(3)

            print(f"Detail URL: {page.url}")

            # Find the download button
            dl_btn = await page.query_selector('button[aria-label="Download"]')
            print(f"Download button found: {dl_btn is not None}")

            if dl_btn:
                # Check what the button does — inspect its onclick/attributes
                info = await dl_btn.evaluate("""e => ({
                    text: e.innerText,
                    tag: e.tagName,
                    type: e.type,
                    cls: e.className.slice(0, 80),
                    parent_tag: e.parentElement.tagName,
                    parent_href: e.parentElement.getAttribute('href'),
                })""")
                print(f"Download button info: {info}")

                # Listen for downloads and network requests
                downloads = []
                page.on("download", lambda d: downloads.append(d))

                print("Clicking download button...")
                await dl_btn.click()
                await asyncio.sleep(5)

                if downloads:
                    dl = downloads[0]
                    print(f"Download triggered!")
                    print(f"  Suggested filename: {dl.suggested_filename}")
                    out_path = str(Path(__file__).parent / "test_output" / "eagle_download.png")
                    await dl.save_as(out_path)
                    size = Path(out_path).stat().st_size
                    print(f"  Saved to: {out_path}")
                    print(f"  File size: {size:,} bytes")
                else:
                    print("No download event triggered.")
                    # Check if a new tab opened
                    pages = ctx.pages
                    print(f"Open pages: {len(pages)}")
                    for p in pages:
                        print(f"  {p.url[:80]}")

                    # Maybe the image is now higher res on the detail page
                    detail_imgs = await page.query_selector_all("img")
                    for img in detail_imgs:
                        src = await img.get_attribute("src") or ""
                        alt = await img.get_attribute("alt") or ""
                        box = await img.bounding_box()
                        w = box["width"] if box else 0
                        h = box["height"] if box else 0
                        if w > 200:
                            src_info = f"base64 ({len(src)} chars)" if src.startswith("data:") else src[:80]
                            print(f"  Large img: {w:.0f}x{h:.0f} alt='{alt}' src={src_info}")

    print("\nBrowser stays open 30 seconds...")
    await asyncio.sleep(30)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())

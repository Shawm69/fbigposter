"""Test: three dots -> Download -> Video (no watermark) using coordinate clicks."""

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
    await page.goto("https://sora.chatgpt.com/d/gen_01khs6rs71fg598q3gvvfpjpjd", wait_until="domcontentloaded")
    await asyncio.sleep(5)

    # Find three-dot button
    svg_buttons = await page.query_selector_all("button:has(svg)")
    three_dot = None
    for btn in svg_buttons:
        inner = await btn.evaluate("e => e.querySelector('svg') ? e.querySelector('svg').innerHTML : ''")
        if "M3 12a2" in inner and "m7 0a2" in inner:
            three_dot = btn
            break

    if not three_dot:
        print("Three-dot not found!")
        await asyncio.sleep(30)
        await ctx.close()
        await pw.stop()
        return

    # Click three-dot
    print("1. Clicking three-dot menu...")
    await three_dot.click()
    await asyncio.sleep(2)

    # Click "Download" using the menuitem
    print("2. Clicking Download...")
    dl_item = await page.query_selector('[role="menuitem"]:has-text("Download")')
    if dl_item:
        # Get position and use mouse.click to avoid overlay issues
        box = await dl_item.bounding_box()
        if box:
            await page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            print(f"   Clicked at {box['x'] + box['width']/2:.0f},{box['y'] + box['height']/2:.0f}")
    await asyncio.sleep(2)

    # Now find and click "Video" menuitem (no watermark)
    print("3. Looking for Video option...")

    # Dump what's visible now
    video_items = await page.query_selector_all('[role="menuitem"]')
    for item in video_items:
        text = (await item.evaluate("e => e.innerText.trim()")) or ""
        box = await item.bounding_box()
        pos = f"{box['x']:.0f},{box['y']:.0f}" if box else "hidden"
        print(f"   menuitem: '{text}' at {pos}")

    # Find the "Video" menuitem and click by coordinates
    video_btn = None
    for item in video_items:
        text = (await item.evaluate("e => e.innerText.trim()")) or ""
        if text == "Video":
            video_btn = item
            break

    if video_btn:
        box = await video_btn.bounding_box()
        if box:
            print(f"   Found 'Video' at {box['x']:.0f},{box['y']:.0f}")

            # Set up download listener before clicking
            download_event = asyncio.Future()

            def on_download(dl):
                if not download_event.done():
                    download_event.set_result(dl)

            page.on("download", on_download)

            # Click by coordinates to avoid overlay interception
            await page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            print("   Clicked! Waiting for download...")

            try:
                dl = await asyncio.wait_for(download_event, timeout=60)
                print(f"   Download started: {dl.suggested_filename}")
                out_path = str(Path(__file__).parent / "test_output" / "panda_video.mp4")
                Path(out_path).parent.mkdir(parents=True, exist_ok=True)
                await dl.save_as(out_path)
                size = Path(out_path).stat().st_size
                print(f"   Saved to: {out_path}")
                print(f"   File size: {size:,} bytes")
            except asyncio.TimeoutError:
                print("   No download event after 60s")
                # Check for new tabs
                pages = ctx.pages
                print(f"   Open pages: {len(pages)}")
                for p in pages:
                    print(f"     {p.url[:100]}")
        else:
            print("   Video button has no bounding box (hidden?)")
    else:
        print("   No 'Video' menuitem found!")
        await page.screenshot(path="sora_download_debug.png")

    print("\nBrowser stays open 30s...")
    await asyncio.sleep(30)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())

"""Test: try both approaches - direct video src download AND menu click with popup handling."""

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

    # ── Approach A: Get video src URL directly ──
    print("=== Approach A: Direct video src ===")
    video = await page.query_selector("video")
    if video:
        src = await video.get_attribute("src") or ""
        print(f"Video src: {src[:120]}...")
        if src.startswith("http"):
            # Download it directly
            out_a = str(Path(__file__).parent / "test_output" / "panda_direct.mp4")
            Path(out_a).parent.mkdir(parents=True, exist_ok=True)
            response = await page.request.get(src)
            content = await response.body()
            Path(out_a).write_bytes(content)
            size = Path(out_a).stat().st_size
            print(f"Downloaded directly: {size:,} bytes -> {out_a}")

    # ── Approach B: Menu click with popup/download handling ──
    print("\n=== Approach B: Three-dot -> Download -> Video ===")

    # Find three-dot button
    svg_buttons = await page.query_selector_all("button:has(svg)")
    three_dot = None
    for btn in svg_buttons:
        inner = await btn.evaluate("e => e.querySelector('svg') ? e.querySelector('svg').innerHTML : ''")
        if "M3 12a2" in inner and "m7 0a2" in inner:
            three_dot = btn
            break

    if three_dot:
        await three_dot.click()
        await asyncio.sleep(2)

        # Hover over "Download" to trigger submenu
        dl_item = await page.query_selector('[role="menuitem"]:has-text("Download")')
        if dl_item:
            box = await dl_item.bounding_box()
            if box:
                # Hover first, then click
                await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                await asyncio.sleep(0.5)
                await page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                await asyncio.sleep(2)

        # Find "Video" menuitem
        video_items = await page.query_selector_all('[role="menuitem"]')
        video_btn = None
        for item in video_items:
            text = (await item.evaluate("e => e.innerText.trim()")) or ""
            if text == "Video":
                video_btn = item
                break

        if video_btn:
            box = await video_btn.bounding_box()
            if box:
                # Set up ALL event listeners
                downloads = []
                popups = []
                page.on("download", lambda d: downloads.append(d))
                ctx.on("page", lambda p: popups.append(p))

                # Also try intercepting the network request
                requests_log = []
                page.on("request", lambda r: requests_log.append(r.url) if "video" in r.url.lower() or "download" in r.url.lower() else None)

                # Click with force
                await video_btn.click(force=True)
                await asyncio.sleep(5)

                print(f"Downloads triggered: {len(downloads)}")
                print(f"Popups/new pages: {len(popups)}")
                print(f"Video/download requests: {len(requests_log)}")

                if downloads:
                    dl = downloads[0]
                    out_b = str(Path(__file__).parent / "test_output" / "panda_menu.mp4")
                    await dl.save_as(out_b)
                    size = Path(out_b).stat().st_size
                    print(f"Menu download: {size:,} bytes -> {out_b}")

                if popups:
                    for p in popups:
                        print(f"New page URL: {p.url[:100]}")

                for url in requests_log[:5]:
                    print(f"Request: {url[:120]}")

                # Check all open pages
                all_pages = ctx.pages
                print(f"\nAll open pages: {len(all_pages)}")
                for p in all_pages:
                    print(f"  {p.url[:100]}")

    print("\nBrowser stays open 30s...")
    await asyncio.sleep(30)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())

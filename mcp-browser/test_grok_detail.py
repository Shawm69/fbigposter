"""Probe: after generation, inspect the results page tiles and the detail view."""

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
        args=["--disable-blink-features=AutomationControlled"],
    )

    page = await ctx.new_page()
    await page.goto("https://grok.com/imagine", wait_until="domcontentloaded")
    await asyncio.sleep(5)

    # Submit a prompt
    editor = await page.query_selector('[contenteditable="true"]')
    await editor.click()
    await page.keyboard.press("Control+a")
    await page.keyboard.press("Backspace")
    await page.keyboard.type("a tiny kitten playing with yarn, studio lighting", delay=20)
    await asyncio.sleep(0.5)

    submit = await page.query_selector('button[aria-label="Submit"]')
    await submit.click()
    print("Submitted. Waiting for generation page...")

    # Wait for the URL to change (redirect to results page)
    await asyncio.sleep(3)
    print(f"URL after submit: {page.url}")

    # Wait for images to load — poll until we see non-blurry images
    # Let's just wait a fixed time and then inspect
    print("Waiting 20s for images to fully load...")
    await asyncio.sleep(20)
    await page.screenshot(path="debug_results_page.png")

    # Inspect ALL img elements on the results page
    imgs = await page.query_selector_all("img")
    print(f"\nTotal img elements on results page: {len(imgs)}")
    for i, img in enumerate(imgs):
        src = await img.get_attribute("src") or ""
        alt = await img.get_attribute("alt") or ""
        cls = await img.evaluate("e => e.className")
        box = await img.bounding_box()
        w = box["width"] if box else 0
        h = box["height"] if box else 0
        src_preview = src[:80] if not src.startswith("data:") else f"data:{src[5:20]}...({len(src)} chars)"
        print(f"  img[{i}]: {w:.0f}x{h:.0f} alt='{alt}' class='{cls[:50]}' src='{src_preview}'")

    # Now try to click on the first large result image
    # The tiles in the grid are likely wrapped in clickable divs/buttons
    print("\n--- Looking for clickable tile wrappers ---")

    # Try finding the parent container of the result images
    result_imgs = [img for img in imgs if (await img.bounding_box() or {}).get("width", 0) > 200]
    print(f"Large images (>200px wide): {len(result_imgs)}")

    if result_imgs:
        first_img = result_imgs[0]
        # Get the parent chain to find what's clickable
        parent_info = await first_img.evaluate("""e => {
            let info = [];
            let el = e;
            for (let i = 0; i < 5; i++) {
                el = el.parentElement;
                if (!el) break;
                info.push({
                    tag: el.tagName,
                    role: el.getAttribute('role'),
                    cls: (el.className || '').toString().slice(0, 50),
                    cursor: getComputedStyle(el).cursor,
                    onClick: !!el.onclick,
                    tabIndex: el.tabIndex
                });
            }
            return info;
        }""")
        print("Parent chain of first large image:")
        for p in parent_info:
            print(f"  <{p['tag']}> role={p['role']} cursor={p['cursor']} tabIndex={p['tabIndex']} class='{p['cls']}'")

        # Try clicking the parent with cursor=pointer or a known role
        for p_idx, p in enumerate(parent_info):
            if p["cursor"] == "pointer" or p["role"] == "button" or p["tag"] == "A":
                print(f"\nClicking parent #{p_idx} (<{p['tag']}>)...")
                clickable = await first_img.evaluate(
                    f"e => {{ let el = e; for(let i=0;i<{p_idx+1};i++) el=el.parentElement; return el; }}"
                )
                # Use page click on the element's position instead
                box = await first_img.bounding_box()
                if box:
                    await page.click(f"img >> nth={imgs.index(first_img)}", timeout=5000)
                break
        else:
            # Just try clicking the image directly with force
            print("\nForce-clicking the image...")
            box = await first_img.bounding_box()
            if box:
                await page.mouse.click(box["x"] + box["width"]/2, box["y"] + box["height"]/2)

        await asyncio.sleep(3)
        await page.screenshot(path="debug_detail_view.png")
        print(f"\nURL after clicking tile: {page.url}")

        # Probe for download/save/share buttons
        print("\n--- Detail view buttons ---")
        buttons = await page.query_selector_all("button")
        for btn in buttons:
            text = await btn.evaluate("e => (e.innerText || '').trim()")
            aria = await btn.get_attribute("aria-label") or ""
            if text or aria:
                print(f"  button: text='{text[:40]}' aria='{aria}'")

        # Check for download links
        links = await page.query_selector_all("a")
        for link in links:
            text = await link.evaluate("e => (e.innerText || '').trim()")
            href = await link.get_attribute("href") or ""
            download_attr = await link.get_attribute("download")
            if "download" in (text + href).lower() or download_attr is not None:
                print(f"  download link: text='{text}' href='{href[:60]}' download={download_attr}")

    print("\nBrowser stays open 30 seconds...")
    await asyncio.sleep(30)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())

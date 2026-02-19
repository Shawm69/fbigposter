"""Quick script to open Grok and Sora, take screenshots, and probe DOM selectors."""

import asyncio
from playwright.async_api import async_playwright
from pathlib import Path


async def probe_selectors(page, name):
    """Try common selectors and report what's found."""
    selectors = [
        ("textarea", "textarea"),
        ("input[type=text]", 'input[type="text"]'),
        ("contenteditable", '[contenteditable="true"]'),
        ("role=textbox", '[role="textbox"]'),
        ("button:Create", 'button:has-text("Create")'),
        ("button:Generate", 'button:has-text("Generate")'),
        ("button:Submit", 'button[type="submit"]'),
        ("button:Go", 'button:has-text("Go")'),
        ("button:Download", 'button:has-text("Download")'),
        ("button:More", 'button[aria-label="More"]'),
        ("button:MoreOptions", 'button[aria-label="More options"]'),
        ("video", "video"),
        ("video source", "video source"),
        ("img (large)", "img"),
    ]

    print(f"\n=== {name} SELECTOR PROBE ===")
    for label, sel in selectors:
        try:
            els = await page.query_selector_all(sel)
            if els:
                count = len(els)
                details = []
                for el in els[:3]:
                    tag = await el.evaluate("e => e.tagName")
                    text = await el.evaluate("e => (e.innerText || e.placeholder || e.value || '').slice(0, 80)")
                    cls = await el.evaluate("e => e.className ? e.className.toString().slice(0, 60) : ''")
                    aria = await el.evaluate("e => e.getAttribute('aria-label') || ''")
                    details.append(f"<{tag} class='{cls}' aria='{aria}' text='{text}'>")
                print(f"  FOUND {label} ({count}x): {'; '.join(details)}")
            else:
                print(f"  miss  {label}")
        except Exception as e:
            print(f"  ERROR {label}: {e}")


async def inspect():
    pw = await async_playwright().start()
    user_data = Path.home() / ".smi-browser"
    user_data.mkdir(parents=True, exist_ok=True)

    ctx = await pw.chromium.launch_persistent_context(
        user_data_dir=str(user_data),
        headless=False,
        viewport={"width": 1280, "height": 900},
        args=["--disable-blink-features=AutomationControlled"],
    )

    # ── Grok Imagine ──
    page1 = await ctx.new_page()
    print("Opening grok.com/imagine...")
    await page1.goto("https://grok.com/imagine", wait_until="domcontentloaded")
    await asyncio.sleep(8)
    await page1.screenshot(path="screenshot_grok.png", full_page=False)
    print(f"Grok final URL: {page1.url}")
    print(f"Grok title: {await page1.title()}")
    await probe_selectors(page1, "GROK")

    # ── Sora Storyboard ──
    page2 = await ctx.new_page()
    print("\nOpening sora.chatgpt.com/storyboard...")
    await page2.goto("https://sora.chatgpt.com/storyboard", wait_until="domcontentloaded")
    await asyncio.sleep(8)
    await page2.screenshot(path="screenshot_sora.png", full_page=False)
    print(f"Sora final URL: {page2.url}")
    print(f"Sora title: {await page2.title()}")
    await probe_selectors(page2, "SORA")

    print("\n\nBrowser stays open for 60 seconds — log in if needed, then run again.")
    print("Screenshots saved: screenshot_grok.png, screenshot_sora.png")
    await asyncio.sleep(60)

    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(inspect())

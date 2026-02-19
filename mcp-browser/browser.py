"""Shared Playwright browser manager with persistent sessions."""

import asyncio
from pathlib import Path
from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Playwright

from config import USER_DATA_DIR, HEADLESS, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, DEFAULT_TIMEOUT_MS

_playwright: Playwright | None = None
_context: BrowserContext | None = None


async def _ensure_playwright() -> Playwright:
    """Launch Playwright instance (singleton)."""
    global _playwright
    if _playwright is None:
        _playwright = await async_playwright().start()
    return _playwright


async def get_context() -> BrowserContext:
    """Get or create a persistent browser context.

    Uses a persistent user data directory so Grok/Sora login sessions
    survive across server restarts.
    """
    global _context
    if _context is not None:
        try:
            # Verify context is still alive
            _context.pages
            return _context
        except Exception:
            _context = None

    pw = await _ensure_playwright()
    user_data = Path(USER_DATA_DIR)
    user_data.mkdir(parents=True, exist_ok=True)

    _context = await pw.chromium.launch_persistent_context(
        user_data_dir=str(user_data),
        headless=HEADLESS,
        viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
        accept_downloads=True,
        args=[
            "--disable-blink-features=AutomationControlled",
        ],
    )
    return _context


async def get_page(url: str) -> Page:
    """Open a new page and navigate to the given URL."""
    ctx = await get_context()
    page = await ctx.new_page()
    page.set_default_timeout(DEFAULT_TIMEOUT_MS)
    await page.goto(url, wait_until="domcontentloaded")
    return page


async def wait_for_element(
    page: Page, selector: str, timeout_ms: int = DEFAULT_TIMEOUT_MS
) -> bool:
    """Wait for an element to appear on the page. Returns True if found."""
    try:
        await page.wait_for_selector(selector, timeout=timeout_ms)
        return True
    except Exception:
        return False


async def screenshot(page: Page, path: str | None = None) -> bytes:
    """Take a screenshot of the page. Returns bytes, optionally saves to path."""
    return await page.screenshot(path=path, full_page=False)


async def download_file(page: Page, url: str, output_path: str) -> str:
    """Download a file from a URL using the page's fetch context."""
    response = await page.request.get(url)
    content = await response.body()
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(content)
    return str(out)


async def close_page(page: Page) -> None:
    """Close a page without closing the browser context."""
    try:
        await page.close()
    except Exception:
        pass


async def check_auth(url: str, auth_indicator_selector: str) -> dict:
    """Check if a site has an authenticated session.

    Returns { authenticated: bool, message: str }.
    """
    try:
        page = await get_page(url)
        # Give the page a moment to settle after navigation
        await asyncio.sleep(2)

        found = await wait_for_element(page, auth_indicator_selector, timeout_ms=10_000)
        current_url = page.url

        await close_page(page)

        if found:
            return {"authenticated": True, "message": f"Session active at {current_url}"}
        else:
            return {
                "authenticated": False,
                "message": f"Not authenticated. Please log in manually at {url}",
            }
    except Exception as e:
        return {"authenticated": False, "message": f"Error checking auth: {str(e)}"}


async def shutdown() -> None:
    """Close browser context and Playwright."""
    global _context, _playwright
    if _context:
        try:
            await _context.close()
        except Exception:
            pass
        _context = None
    if _playwright:
        try:
            await _playwright.stop()
        except Exception:
            pass
        _playwright = None

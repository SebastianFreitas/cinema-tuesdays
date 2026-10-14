"""Minimal TMDB client. Accepts either a v3 API key or a v4 read access token (starts with 'eyJ')."""
import aiohttp

API = "https://api.themoviedb.org/3"
IMAGE = "https://image.tmdb.org/t/p/"


def poster_url(path: str | None, size: str = "w342") -> str | None:
    return f"{IMAGE}{size}{path}" if path else None


def movie_url(tmdb_id: int | None) -> str | None:
    return f"https://www.themoviedb.org/movie/{tmdb_id}" if tmdb_id else None


class TMDB:
    def __init__(self, token: str):
        self.token = token
        self._session: aiohttp.ClientSession | None = None

    @property
    def enabled(self) -> bool:
        return bool(self.token)

    async def _get(self, path: str, **params) -> dict:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8))
        headers = {}
        if self.token.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {self.token}"
        else:
            params["api_key"] = self.token
        async with self._session.get(f"{API}{path}", params=params, headers=headers) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def search(self, query: str, year: int | None = None) -> list[dict]:
        params = {"query": query, "include_adult": "false"}
        if year:
            params["year"] = year
        data = await self._get("/search/movie", **params)
        return data.get("results", [])

    async def details(self, tmdb_id: int) -> dict:
        """Returns a dict shaped for DB.upsert_movie."""
        d = await self._get(f"/movie/{tmdb_id}", append_to_response="credits")
        directors = [c["name"] for c in d.get("credits", {}).get("crew", []) if c.get("job") == "Director"]
        release = d.get("release_date") or ""
        return {
            "tmdb_id": d["id"],
            "title": d.get("title") or d.get("original_title"),
            "original_title": d.get("original_title"),
            "year": int(release[:4]) if release[:4].isdigit() else None,
            "director": ", ".join(directors) or None,
            "runtime": d.get("runtime") or None,
            "poster_path": d.get("poster_path"),
            "overview": d.get("overview") or None,
        }

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

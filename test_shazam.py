import asyncio
from shazamio import Shazam

async def main():
    shazam = Shazam()
    print("Shazam ready")

asyncio.run(main())

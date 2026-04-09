from workers import WorkerEntrypoint, Response, fetch


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        """
        Optional Python edge scaffold for Cloudflare.
        Pages Functions remain JavaScript/TypeScript, so this Worker is provided
        as a future-safe Python entrypoint if SSA wants to move Python-specific
        edge logic onto Workers later.
        """
        target = self.env.SSA_API_BASE or "https://sportssenseai-api.david-chestang02.workers.dev"
        response = await fetch(f"{target}/health")
        return Response(
            await response.text(),
            status=response.status,
            headers={"content-type": "application/json"},
        )

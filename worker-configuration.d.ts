interface Env {
  ASSETS?: Fetcher;
  CACHE?: KVNamespace;
  RATE_LIMIT?: KVNamespace;
  ALLOWED_ORIGINS?: string;
  ALLOW_LOCAL_ORIGINS?: string;
  REQUIRE_APP_REFERER?: string;
}

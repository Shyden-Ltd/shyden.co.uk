# The back-translation engine (#95): LibreTranslate, reading id, zh, vi and th
# back into English for .github/workflows/back-translation.yml.
#
# Pinned here rather than in the workflow because Dependabot reads no image
# out of a workflow file: this is the one place it can bump the digest, and
# the tag beside it is what makes that bump reviewable. Both are held by
# tests/unit/supply-chain.test.ts.
#
# Run it locally the same way CI does:
#
#   docker build -t back-translation-engine docker/libretranslate
#   docker run -p 5000:5000 back-translation-engine
FROM libretranslate/libretranslate:v1.9.6@sha256:1de2d7056bb8ad607a412f4563d9abe324ff632b43b5be9428bcc8e213aebb32

# Only the languages the site ships: every other model is a download nobody
# reads. The engine names Simplified Chinese `zh` here and `zh-Hans` in its
# API, which is why the script asks for the script, not the code.
ENV LT_LOAD_ONLY=en,id,zh,vi,th

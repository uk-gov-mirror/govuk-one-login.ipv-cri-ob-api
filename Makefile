# SAM does not support BuildMethod: esbuild for AWS::Serverless::LayerVersion.
# A Makefile build method is used instead to run esbuild directly.
# ContentUri points to the project root so SAM copies the full project
# (including src) to the build directory. .samignore excludes node_modules,
# so we npm install here to get esbuild available for bundling.
.PHONY: build-ObTokenPluginLayer

build-ObTokenPluginLayer:
	npm ci --omit=dev
	./node_modules/.bin/esbuild src/thirdparty-async-token-plugin-ecospend/plugin/ob-token-plugin.ts \
		--bundle \
		--platform=node \
		--target=node24 \
		--format=esm \
		--out-extension:.js=.mjs \
		--outdir="$(ARTIFACTS_DIR)/nodejs" \
		--external:@aws-sdk/*

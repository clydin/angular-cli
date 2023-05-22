workspace(
    name = "angular_cli",
)

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

http_archive(
    name = "aspect_bazel_lib",
    sha256 = "4d6010ca5e3bb4d7045b071205afa8db06ec11eb24de3f023d74d77cca765f66",
    strip_prefix = "bazel-lib-1.39.0",
    url = "https://github.com/aspect-build/bazel-lib/releases/download/v1.39.0/bazel-lib-v1.39.0.tar.gz",
)

load("@aspect_bazel_lib//lib:repositories.bzl", "aspect_bazel_lib_dependencies", "register_jq_toolchains")

aspect_bazel_lib_dependencies()

register_jq_toolchains()

http_archive(
    name = "aspect_rules_js",
    sha256 = "76a04ef2120ee00231d85d1ff012ede23963733339ad8db81f590791a031f643",
    strip_prefix = "rules_js-1.34.1",
    url = "https://github.com/aspect-build/rules_js/releases/download/v1.34.1/rules_js-v1.34.1.tar.gz",
)

load("@aspect_rules_js//js:repositories.bzl", "rules_js_dependencies")

rules_js_dependencies()

http_archive(
    name = "aspect_rules_ts",
    sha256 = "bd3e7b17e677d2b8ba1bac3862f0f238ab16edb3e43fb0f0b9308649ea58a2ad",
    strip_prefix = "rules_ts-2.1.0",
    url = "https://github.com/aspect-build/rules_ts/releases/download/v2.1.0/rules_ts-v2.1.0.tar.gz",
)

load("@aspect_rules_ts//ts:repositories.bzl", "rules_ts_dependencies")

rules_ts_dependencies(
    ts_integrity = "sha512-pXWcraxM0uxAS+tN0AG/BF2TyqmHO014Z070UsJ+pFvYuRSq8KH8DmWpnbXe0pEPDHXZV3FcAbJkijJ5oNEnWw==",
    ts_version_from = "//:package.json",
)

http_archive(
    name = "aspect_rules_jasmine",
    sha256 = "4c16ef202d1e53fd880e8ecc9e0796802201ea9c89fa32f52d5d633fff858cac",
    strip_prefix = "rules_jasmine-1.1.1",
    url = "https://github.com/aspect-build/rules_jasmine/releases/download/v1.1.1/rules_jasmine-v1.1.1.tar.gz",
)

load("@aspect_rules_jasmine//jasmine:dependencies.bzl", "rules_jasmine_dependencies")

rules_jasmine_dependencies()

load("@rules_nodejs//nodejs:repositories.bzl", "nodejs_register_toolchains")

nodejs_register_toolchains(
    name = "node18",
    node_version = "18.13.0",
)

# Set the default nodejs toolchain to the latest supported major version
nodejs_register_toolchains(
    name = "nodejs",
    node_version = "18.13.0",
)

nodejs_register_toolchains(
    name = "node20",
    # The below can be removed once @rules_nodejs/nodejs is updated to latest which contains https://github.com/bazelbuild/rules_nodejs/pull/3701
    node_repositories = {
        "20.9.0-darwin_arm64": ("node-v20.9.0-darwin-arm64.tar.gz", "node-v20.9.0-darwin-arm64", "31d2d46ae8d8a3982f54e2ff1e60c2e4a8e80bf78a3e8b46dcaac95ac5d7ce6a"),
        "20.9.0-darwin_amd64": ("node-v20.9.0-darwin-x64.tar.gz", "node-v20.9.0-darwin-x64", "fc5b73f2a78c17bbe926cdb1447d652f9f094c79582f1be6471b4b38a2e1ccc8"),
        "20.9.0-linux_arm64": ("node-v20.9.0-linux-arm64.tar.xz", "node-v20.9.0-linux-arm64", "ced3ecece4b7c3a664bca3d9e34a0e3b9a31078525283a6fdb7ea2de8ca5683b"),
        "20.9.0-linux_ppc64le": ("node-v20.9.0-linux-ppc64le.tar.xz", "node-v20.9.0-linux-ppc64le", "3c6cea5d614cfbb95d92de43fbc2f8ecd66e431502fe5efc4f3c02637897bd45"),
        "20.9.0-linux_s390x": ("node-v20.9.0-linux-s390x.tar.xz", "node-v20.9.0-linux-s390x", "af1f4e63756ff685d452166c4d5ba93a308e816ee7c46015b5e086163d9f011b"),
        "20.9.0-linux_amd64": ("node-v20.9.0-linux-x64.tar.xz", "node-v20.9.0-linux-x64", "9033989810bf86220ae46b1381bdcdc6c83a0294869ba2ad39e1061f1e69217a"),
        "20.9.0-windows_amd64": ("node-v20.9.0-win-x64.zip", "node-v20.9.0-win-x64", "70d87dad2378c63216ff83d5a754c61d2886fc39d32ce0d2ea6de763a22d3780"),
    },
    node_version = "20.9.0",
)

load("@aspect_rules_js//npm:repositories.bzl", "npm_translate_lock")

npm_translate_lock(
    name = "npm",
    npmrc = "//:.npmrc",
    pnpm_lock = "//:pnpm-lock.yaml",
    verify_node_modules_ignored = "//:.bazelignore",
)

load("@npm//:repositories.bzl", "npm_repositories")

npm_repositories()

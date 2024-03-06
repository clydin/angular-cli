workspace(
    name = "angular_cli",
)

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive", "http_file")

http_archive(
    name = "bazel_skylib",
    sha256 = "cd55a062e763b9349921f0f5db8c3933288dc8ba4f76dd9416aac68acee3cb94",
    urls = [
        "https://mirror.bazel.build/github.com/bazelbuild/bazel-skylib/releases/download/1.5.0/bazel-skylib-1.5.0.tar.gz",
        "https://github.com/bazelbuild/bazel-skylib/releases/download/1.5.0/bazel-skylib-1.5.0.tar.gz",
    ],
)

http_archive(
    name = "io_bazel_rules_webtesting",
    sha256 = "e9abb7658b6a129740c0b3ef6f5a2370864e102a5ba5ffca2cea565829ed825a",
    urls = ["https://github.com/bazelbuild/rules_webtesting/releases/download/0.3.5/rules_webtesting.tar.gz"],
)

http_archive(
    name = "build_bazel_rules_nodejs",
    sha256 = "5dd1e5dea1322174c57d3ca7b899da381d516220793d0adef3ba03b9d23baa8e",
    urls = ["https://github.com/bazelbuild/rules_nodejs/releases/download/5.8.3/rules_nodejs-5.8.3.tar.gz"],
)

load("@build_bazel_rules_nodejs//:repositories.bzl", "build_bazel_rules_nodejs_dependencies")

build_bazel_rules_nodejs_dependencies()

http_archive(
    name = "rules_pkg",
    sha256 = "8c20f74bca25d2d442b327ae26768c02cf3c99e93fad0381f32be9aab1967675",
    urls = ["https://github.com/bazelbuild/rules_pkg/releases/download/0.8.1/rules_pkg-0.8.1.tar.gz"],
)

load("@bazel_tools//tools/sh:sh_configure.bzl", "sh_configure")

sh_configure()

load("@bazel_skylib//:workspace.bzl", "bazel_skylib_workspace")

bazel_skylib_workspace()

load("@rules_pkg//:deps.bzl", "rules_pkg_dependencies")

rules_pkg_dependencies()

# Setup the Node.js toolchain
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

load("@build_bazel_rules_nodejs//:index.bzl", "yarn_install")

yarn_install(
    name = "npm",
    data = [
        "//:.yarn/releases/yarn-1.22.17.cjs",
        "//:.yarnrc",
        "//:tools/postinstall/patches/@angular+bazel+17.0.0-next.1.patch",
        "//:tools/postinstall/patches/@bazel+concatjs+5.8.1.patch",
    ],
    # Currently disabled due to:
    #  1. Missing Windows support currently.
    #  2. Incompatibilites with the `ts_library` rule.
    exports_directories_only = False,
    package_json = "//:package.json",
    # We prefer to symlink the `node_modules` to only maintain a single install.
    # See https://github.com/angular/dev-infra/pull/446#issuecomment-1059820287 for details.
    symlink_node_modules = True,
    yarn = "//:.yarn/releases/yarn-1.22.17.cjs",
    yarn_lock = "//:yarn.lock",
)

http_archive(
    name = "aspect_bazel_lib",
    sha256 = "f2c1f91cc0a55f7a44c94b8a79974f21349b844075740c01045acaa49e731307",
    strip_prefix = "bazel-lib-1.40.3",
    url = "https://github.com/aspect-build/bazel-lib/releases/download/v1.40.3/bazel-lib-v1.40.3.tar.gz",
)

load("@aspect_bazel_lib//lib:repositories.bzl", "aspect_bazel_lib_dependencies", "register_jq_toolchains")

aspect_bazel_lib_dependencies()

register_jq_toolchains(version = "1.6")

register_toolchains(
    "@npm//@angular/build-tooling/bazel/git-toolchain:git_linux_toolchain",
    "@npm//@angular/build-tooling/bazel/git-toolchain:git_macos_x86_toolchain",
    "@npm//@angular/build-tooling/bazel/git-toolchain:git_macos_arm64_toolchain",
    "@npm//@angular/build-tooling/bazel/git-toolchain:git_windows_toolchain",
)

load("@npm//@angular/build-tooling/bazel/browsers:browser_repositories.bzl", "browser_repositories")

browser_repositories()

# rules_js tooling
# This will be incrementally adopted for packages.

http_archive(
    name = "aspect_rules_js",
    sha256 = "edc7b0255114fafdbbd593ea5d5fdfd54b2a603f33b3a49518910ac618e1bf2b",
    strip_prefix = "rules_js-1.38.0",
    url = "https://github.com/aspect-build/rules_js/releases/download/v1.38.0/rules_js-v1.38.0.tar.gz",
)

http_archive(
    name = "aspect_rules_ts",
    sha256 = "c77f0dfa78c407893806491223c1264c289074feefbf706721743a3556fa7cea",
    strip_prefix = "rules_ts-2.2.0",
    url = "https://github.com/aspect-build/rules_ts/releases/download/v2.2.0/rules_ts-v2.2.0.tar.gz",
)

http_archive(
    name = "aspect_rules_jasmine",
    sha256 = "4c16ef202d1e53fd880e8ecc9e0796802201ea9c89fa32f52d5d633fff858cac",
    strip_prefix = "rules_jasmine-1.1.1",
    url = "https://github.com/aspect-build/rules_jasmine/releases/download/v1.1.1/rules_jasmine-v1.1.1.tar.gz",
)

load("@aspect_rules_js//js:repositories.bzl", "rules_js_dependencies")
load("@aspect_rules_ts//ts:repositories.bzl", "rules_ts_dependencies")
load("@aspect_rules_jasmine//jasmine:dependencies.bzl", "rules_jasmine_dependencies")

rules_js_dependencies()

rules_ts_dependencies(
    ts_integrity = "sha512-+2/g0Fds1ERlP6JsakQQDXjZdZMM+rqpamFZJEKh4kwTIn3iDkgKtby0CeNd5ATNZ4Ry1ax15TMx0W2V+miizQ==",
    ts_version_from = "//:package.json",
)

rules_jasmine_dependencies()

nodejs_register_toolchains(
    name = "nodejs_rjs",
    node_version = "20.9.0",
)

load("@aspect_rules_js//npm:npm_import.bzl", "npm_translate_lock")

npm_translate_lock(
    name = "npm_rjs",
    npmrc = "//:.npmrc",
    pnpm_lock = "//packages:pnpm-lock.yaml",
    verify_node_modules_ignored = "//:.bazelignore",
)

load("@npm_rjs//:repositories.bzl", "npm_repositories")

npm_repositories()

http_file(
    name = "rules_js_to_rules_nodejs_adapter",
    downloaded_file_path = "defs.bzl",
    sha256 = "fed5f963d02e913978a76a5fd9ecbd082c54dedbd3cbf12607bce6c91be989ff",
    urls = [
        "https://raw.githubusercontent.com/aspect-build/bazel-examples/1b8be767c587bc1187efa283af515f4c78e78b86/rules_nodejs_to_rules_js_migration/bazel/rules_js_to_rules_nodejs_adapter.bzl",
    ],
)

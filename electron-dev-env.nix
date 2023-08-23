with import <nixpkgs> {};
mkShell {
    nativeBuildInputs = [
        nodejs
        electron_22
    ];
    ELECTRON_OVERRIDE_DIST_PATH = "${electron_22}/bin";
}


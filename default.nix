with import <nixpkgs> {};
mkShell {
    nativeBuildInputs = [
        nodejs
        electron_22
    ];
    permittedInsecurePackages = [
        "electron-22.3.27"
    ];
    ELECTRON_OVERRIDE_DIST_PATH = "${electron_22}/bin";
}


with import ./pinned-package-sets.nix;

pkgs1903.mkShell {
  buildInputs = [ pkgs1903.nodejs-10_x ];  
  shellHook = ''
    export PATH=./node_modules/.bin:$PATH
  '';
}

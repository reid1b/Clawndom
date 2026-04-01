const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseInstallPackages } = require('../src/parse-command');

describe('parseInstallPackages', () => {
  // --- npm install variants ---

  describe('npm install', () => {
    it('parses npm install with a single package', () => {
      assert.deepStrictEqual(parseInstallPackages('npm install express'), ['express']);
    });

    it('parses npm i shorthand', () => {
      assert.deepStrictEqual(parseInstallPackages('npm i express'), ['express']);
    });

    it('parses npm add', () => {
      assert.deepStrictEqual(parseInstallPackages('npm add express'), ['express']);
    });

    it('parses multiple packages', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm install express lodash axios'),
        ['express', 'lodash', 'axios']
      );
    });

    it('skips flags', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm install --save-dev express -g lodash'),
        ['express', 'lodash']
      );
    });

    it('handles scoped packages', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm install @angular/core @babel/preset-env'),
        ['@angular/core', '@babel/preset-env']
      );
    });

    it('handles packages with versions', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm install lodash@4.17.21 express@^4.0.0'),
        ['lodash@4.17.21', 'express@^4.0.0']
      );
    });

    it('skips local paths', () => {
      assert.deepStrictEqual(parseInstallPackages('npm install ./local ../parent /abs ~/home'), []);
    });

    it('returns [] for bare npm install', () => {
      assert.deepStrictEqual(parseInstallPackages('npm install'), []);
    });

    it('returns [] for bare npm install with only flags', () => {
      assert.deepStrictEqual(parseInstallPackages('npm install --production'), []);
    });

    it('returns [] for non-install npm commands', () => {
      assert.deepStrictEqual(parseInstallPackages('npm start'), []);
      assert.deepStrictEqual(parseInstallPackages('npm test'), []);
      assert.deepStrictEqual(parseInstallPackages('npm run build'), []);
    });
  });

  // --- Shell operators ---

  describe('shell operators', () => {
    it('extracts packages before && operator', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm install foo && npm start'),
        ['foo']
      );
    });

    it('extracts packages from both sides of &&', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm install foo && npm install bar'),
        ['foo', 'bar']
      );
    });

    it('handles || operator', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm install foo || echo failed'),
        ['foo']
      );
    });

    it('handles ; operator', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm install foo; npm install bar'),
        ['foo', 'bar']
      );
    });

    it('handles | pipe operator', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm install foo | tee log.txt'),
        ['foo']
      );
    });

    it('truncates at redirect >', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm install foo > output.log'),
        ['foo']
      );
    });
  });

  // --- Environment variables ---

  describe('environment variables', () => {
    it('strips leading env vars', () => {
      assert.deepStrictEqual(
        parseInstallPackages('NODE_ENV=production npm install foo'),
        ['foo']
      );
    });

    it('strips multiple env vars', () => {
      assert.deepStrictEqual(
        parseInstallPackages('NODE_ENV=prod CI=true npm install foo'),
        ['foo']
      );
    });
  });

  // --- yarn ---

  describe('yarn add', () => {
    it('parses yarn add with packages', () => {
      assert.deepStrictEqual(parseInstallPackages('yarn add express lodash'), ['express', 'lodash']);
    });

    it('parses yarn add with flags', () => {
      assert.deepStrictEqual(parseInstallPackages('yarn add --dev express'), ['express']);
    });

    it('ignores bare yarn install', () => {
      assert.deepStrictEqual(parseInstallPackages('yarn install'), []);
    });

    it('ignores bare yarn', () => {
      assert.deepStrictEqual(parseInstallPackages('yarn'), []);
    });
  });

  // --- pnpm ---

  describe('pnpm add/install', () => {
    it('parses pnpm add with packages', () => {
      assert.deepStrictEqual(parseInstallPackages('pnpm add express'), ['express']);
    });

    it('parses pnpm install with packages', () => {
      assert.deepStrictEqual(parseInstallPackages('pnpm install express'), ['express']);
    });

    it('parses pnpm i shorthand with packages', () => {
      assert.deepStrictEqual(parseInstallPackages('pnpm i express'), ['express']);
    });

    it('ignores bare pnpm install (no packages)', () => {
      assert.deepStrictEqual(parseInstallPackages('pnpm install'), []);
    });

    it('ignores bare pnpm install with only flags', () => {
      assert.deepStrictEqual(parseInstallPackages('pnpm install --frozen-lockfile'), []);
    });
  });

  // --- npx ---

  describe('npx', () => {
    it('extracts the command package', () => {
      assert.deepStrictEqual(parseInstallPackages('npx create-react-app my-app'), ['create-react-app']);
    });

    it('extracts -p package args', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npx -p typescript -p ts-node ts-node script.ts'),
        ['typescript', 'ts-node', 'ts-node']
      );
    });

    it('extracts --package args', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npx --package=cowsay cowsay hello'),
        ['cowsay', 'cowsay']
      );
    });

    it('skips flags before command', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npx --yes create-react-app my-app'),
        ['create-react-app']
      );
    });

    it('skips local paths as commands', () => {
      assert.deepStrictEqual(parseInstallPackages('npx ./local-script.js'), []);
    });
  });

  // --- npm create / init ---

  describe('npm create/init', () => {
    it('npm create foo → create-foo', () => {
      assert.deepStrictEqual(parseInstallPackages('npm create vite'), ['create-vite']);
    });

    it('npm init foo → create-foo', () => {
      assert.deepStrictEqual(parseInstallPackages('npm init vite'), ['create-vite']);
    });

    it('npm create @scope/foo → @scope/create-foo', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm create @vitejs/app'),
        ['@vitejs/create-app']
      );
    });

    it('strips version from create target', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm create vite@latest'),
        ['create-vite']
      );
    });

    it('skips flags', () => {
      assert.deepStrictEqual(
        parseInstallPackages('npm create --yes vite'),
        ['create-vite']
      );
    });
  });

  // --- Edge cases ---

  describe('edge cases', () => {
    it('returns [] for empty string', () => {
      assert.deepStrictEqual(parseInstallPackages(''), []);
    });

    it('returns [] for non-string input', () => {
      assert.deepStrictEqual(parseInstallPackages(null), []);
      assert.deepStrictEqual(parseInstallPackages(undefined), []);
      assert.deepStrictEqual(parseInstallPackages(42), []);
    });

    it('returns [] for unrecognized commands', () => {
      assert.deepStrictEqual(parseInstallPackages('echo hello'), []);
      assert.deepStrictEqual(parseInstallPackages('ls -la'), []);
    });
  });
});

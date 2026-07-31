import { Config } from '@remotion/cli/config';

// core/media IS Remotion's public root (see MIGRATION.md): staticFile('library/logos/x') →
// public/library/logos/x (symlinked to ../../media). The default public/ dir
// (next to package.json) resolves correctly via the symlink created in CI.

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency(null); // auto

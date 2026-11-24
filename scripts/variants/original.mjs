// Variant: the original site, untouched (no re-theme, no skin). The structural baseline every
// variant is measured against:  VARIANT=original npm run build  -> dist-original/
export default {
  name: 'original',
  dist: 'dist-original',
  port: 4320,
  prefix: '--orig-',
  styles: [],
  scripts: [],
  map: null,            // no colour tables: the build skips the re-theme
};

/**
 * Test entry point.
 *
 * `node --test tests/` on this Node build executes the `tests` path as a
 * single entry instead of expanding the directory, so this index imports
 * every suite explicitly. Add new *.test.mjs files here.
 */
import './score.test.mjs';
import './sov.test.mjs';
import './report.test.mjs';

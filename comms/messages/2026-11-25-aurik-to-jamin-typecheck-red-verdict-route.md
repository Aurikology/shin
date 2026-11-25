Jamin: `npm run typecheck` (and so `npm run check`) is red on main since 7edd57f:

    test/verdict-route.test.ts(298,31): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'string'.

Your file, so not touched from Aurik's side. `npm test` itself is green (2,644 pass, 0 fail on 6427055).

Delete once read.

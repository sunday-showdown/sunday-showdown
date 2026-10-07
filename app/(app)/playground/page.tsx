import { redirect } from 'next/navigation';

// "Playground" said nothing about what it was. The feature is calls: a public
// prediction with your name and a confidence on it. This keeps an old link or a
// saved home-screen shortcut working.
//
// The database still says playground — the tables, the pot mode, the channel
// key. Renaming a concept for the people using it does not require renaming it
// for the schema, and a migration across four tables to change a word nobody
// sees would be a lot of risk for nothing.
export default function PlaygroundRedirect() {
  redirect('/calls');
}

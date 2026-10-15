// The app's entry point. The background check for new chapters must be defined as soon as the bundle loads (the system
// runs it without opening any screen), so it is imported before the router takes over.
import "./src/alerts/task";
import "expo-router/entry";

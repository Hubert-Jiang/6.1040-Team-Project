# Application Types and Instances

```types
```

```instances
instantiate Authenticating
instantiate Sessioning with
  Subject is Authenticating.User
instantiate Hosting with
  Host is Authenticating.User
instantiate Reserving with
  Resource is Hosting.Gathering
  User is Authenticating.User
instantiate Linking with
  Target is Hosting.Gathering
  Creator is Authenticating.User
instantiate Inviting with
  Event is Hosting.Gathering
  Guest is Authenticating.User
```

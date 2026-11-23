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
```

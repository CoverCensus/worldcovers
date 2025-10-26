# Covers


Welcome to _**Covers**_, a stampless cover and postmark catalog application

This build, nicknamed _Lightspeed_, is version **2.01**

> Another success is the post-office, with its educating energy augmented by cheapness and guarded by a certain religious sentiment in mankind; so that the power of a wafer or a drop of wax or gluten to guard a letter, as it flies over sea over land and comes to its address as if a battalion of artillery brought it, I look upon as a fine meter of civilization.

&nbsp;&nbsp;&nbsp;&nbsp;-- _Ralph Waldo Emerson_

## Table of Contents
- [Project Overview](#project-overview)
- [Building](#building)
- [Configuration](#configuration)
- [Execution](#execution)
- [Errata](#errata)


## Project Overview

Version strings follow the **MAJOR**(#?).**MINOR**(#??) format.  

Current planned Milestones are `alpha`, `beta`, and `rtm`.  

Currently only tested on Chromium (TODO: version?) on Windows 11, and Brave (1.82.170-arm64) on macOS Sequoia

For licensing details, see [LICENSE](LICENSE)

###  **Apps**:
* [server](./src/server/)
  * TODO: DESCRIBE HERE
* [web](./src/web/)
  * TODO: DESCRIBE HERE


For more details see [DESIGN.md](./docs/DESIGN.md)


## Building

### Quickstart

This project uses `pipenv`, and `django`. Make sure you have at least `python` 3.11 installed.

`dotenv` is used as well, but strictly for convenience.  It allows you to directly call `django-admin` for all project commands, instead of `python manage.py`. 

For building other targets, and instructions for packaging in preparation for deployment, see [BUILD.md](./docs/BUILD.md)


## Configuration

### TODO

## Execution

To run **Covers** in Production mode, execute the following:
```sh
./TODO
```

To run both the backend and frontend in debug mode, execute the following instead:
```sh
./TODO
```

For information on how to run the separate sub-projects, and perform administrative actions post-deployment, see [RUNBOOK.md](./docs/RUNBOOK.md)


## Errata

TODO:  Links to repo wiki

TODO:  Links to user documentation

TODO:  Links to developer/contributor documentation

Of course, make sure you also visit our sponsor [The US Philatelic Classics Society](https://www.uspcs.org/), and see [our live version of this app](https://hellowoco.app/)!

> For any issues or contributions to **Covers**, please refer to our [issue tracker](#) or [contributing guide](#).

_Enjoy!_
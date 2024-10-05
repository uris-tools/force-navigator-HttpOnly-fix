# Building


To build the extension from scratch:

In the root folder (folder with package.json):

    npm install --global web-ext
    npm install --verbose
    mkdir build
    cd build
    npm run build


# Development:

    npm run watch

to build the extention for Chrome browser  or

    npm run watch_firefox

to build it for Firefox.
Both commands will monitor the source files and rebuild as needed.

In a separate window:

    #For Firefox:
    web-ext run --start-url "[SF HOMEPAGE URL]"  --firefox-Profile=[PROFILE NAME] --devtools --keep-profile-changes
    #For Chrome:
    web-ext run --start-url "[SF HOMEPAGE URL]"   --target chromium --chromium-profile [PROFILE NAME] --devtools --keep-profile-changes


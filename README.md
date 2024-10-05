
# Salesforce Commander



Get more done in Salesforce - list and search records, make new ones, find faster  or login as on the fly!
This extension helps you get to any Salesforce page quickly. Just type in what you need to do!

Compatible with Firefox and Chrome

![Animated Demo](web/demo1.gif)

Open the Commander and
- Press <kbd>Ctrl</kbd>-<kbd>Shift</kbd>-<kbd>Space</kbd> to open the Commander bar
- Enter "List [Object] <kbd>Enter</kbd>" to get to the object list. 
- Enter "List [Object] <kbd>Enter</kbd>"<kbd>Tab</kbd> to see the the available listviews for this object, and choose one. 
- Enter "Setup [Object] fields<kbd>Tab</kbd>" to see the list of fields, and choose one using arrow keys+<kbd>Enter</kbd> or mouse.
- Enter "Users <kbd>Tab</kbd> [partial name]"
  - Press "Users <kbd>Tab</kbd>" to show all defined users and access their details directly.  
- Direct access to subpages for different objects like:
    - Access user pages directly by typing "users [partial name]"
    use- Access custom object fields directly "[object name] fields <kbd>Tab</kbd> [field name]". For Example "account fields Tab name"


- Add tasks on the fly by typing "! [your task]"
- Search all records with "? [search terms]"
- Go to your Home page with "Home"
- Object List views with "List [Object]"
- Create a new record with "New [Object]"
- Go directly a Setup page by typing it's name
- Access Object customizations with "[Object]  [Section]>" (e.g. "Contact Fields")
  - Press <kbd>Tab</kbd> after the section, to get a list of items.   For example "Contact Fields <kbd>Tab</kbd>" will show all Contact fields for direct access.
- Commands looking weird? Run "Refresh Metadata" to make sure you have what you need
- Login as another user with "Login as [partial match of username]"

** You can hold shift or control when you press enter or click your mouse to open the selected item in a new tab **

### Default shortcut keys

(use Command instead of Control on Mac)
- Control + Shift + Space: Navigator Bar
- Control + Shift + A: Lightning App Menu
- Control + Shift + 1: Tasks
- Control + Shift + 2: Reports


### Customize shortcuts at:
- Chrome - chrome://extensions/shortcuts
- Firefox - about://addons --> Manage Extension shortcuts


NOTE: If you have a custom instance Domain Name, you may have to create a CSP Trusted Site Definition for your Classic domain URL in order for this extension to work - more info here https://developer.salesforce.com/docs/atlas.en-us.lightning.meta/lightning/csp_trusted_sites.htm

Contribute to this extension at https://github.com/uris-tools/Salesforce-Commander

## Maintainer(s):
[Uri Eyal](uri@eyal.es)
open to others!
_based on force-navigator by [Danny Summerlin](http://summerlin.co) ,  Salesforce Navigator by [Daniel Nakov](https://twitter.com/dnak0v), and [Wes Weingartner](https://twitter.com/wes1278)_

## License
[MIT License](http://en.wikipedia.org/wiki/MIT_License)

## Privacy Policy
This extension only runs locally in communication with your instance of Salesforce. No data is collected from any user, nor is extension activity tracked or reported to a third-party.

## Terms of Service
This extension is not intended to support the work of any individual or organization that is discriminatory or outright illegal.
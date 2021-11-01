# Testudo+

* Integrates [RateMyProfessors](https://www.ratemyprofessors.com/) and [PlanetTerp](https://planetterp.com/) ratings directly into the course listing
* Sort courses by average GPA
* Adds a "share" button to copy a clean url to any course
* Generates course links wherever courses are referenced

<img alt="CMSC132 0.1.7 Screenshot" src="https://user-images.githubusercontent.com/42500591/139629677-8bfce047-ed39-40e4-b3bf-e9da8ff1f8da.png">

<img alt="CMSC 3 Classes 0.1.7 Screenshot" src="https://user-images.githubusercontent.com/42500591/139629987-b1175ee4-1cac-4f94-bb9f-05b0c34d27aa.png">

## Installation

1. Install [TamperMonkey](https://tampermonkey.net/)
2. Then [click here](https://github.com/tybug/testudoplus/raw/master/testudoplus.user.js) to install the script

Make sure to allow any outgoing traffic made by this plugin.

Don't forget to come back occasionally to check for plugin updates, as period changes occur all the time.

## Contributing

Some professors have different names on testudo and ratemyprofessor. To solve this we maintain [an alias file](https://github.com/tybug/testudoplus/blob/master/alias.json) which maps names on testudo to names on ratemyprofessor (and, in the future, planetterp).

For example, if "Jose Calderon" was actually called "Jose M Calderon" on ratemyprofessor - he's not, but for the sake of example - his entry would look like this:

```json
  "Jose Calderon": {
    "rmp_name": "Jose M Calderon"
  }
```

Feel free to make a pull request to update this alias file! Pull requests are always welcome.

## Credits

This is an up to date fork of the original [terp course helper](https://github.com/DickyT/Terp-Course-Helper), which has been unmaintained since 2020.

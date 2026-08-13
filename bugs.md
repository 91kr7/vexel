- bug-1
  image: bugs-screen/bug-1.png
  description: images menù > after the file system extraction the status is "starting"!
  how to fix: update the status from "starting" to "completed" and after 1sec from "completed" autoclose the popup.
  be carefull! the same problem exists in the popup "Analyzing layer efficiency"! apply the same fix

- bug-2
  image: bugs-screen/bug-2.png
  description: images menù > action "browse filesyste".
  everytime the popup "Filesystem not extracted yet" is showed!
  how to fix: i don't like this popup because it's obvious that the filesystem of an image is not extracter yet so don't show this popup and show immediatelly the popup that contains the text "Extracting the filesystem creates a container from the image (never started) and copies out about ***MB, taking roughly 5s."!

- bug-3
  image: bugs-screen/bug-3.png
  description: popup style is not correct
  how to fix: analyse the screenshot! there are a lot of spaces not used! fix and ehance the layout!

- bug-4
  image: bugs-screen/bug-4.png
  description: too arious layout! actually there are section that contains the container/image configs, environment ecc.... these sections are not well structured because there is too much wasted space
  how to fix: analyse the screenshot! my propose is to subdivide these infos in columns (based on the device size!)

- bug-5
  image: bugs-screen/bug-5.png
  how to fix: Remove all copy buttons!!!!
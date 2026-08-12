- change-1
    image: bugs-screen/change-1.png
    I want reorganize the containers action so in the container row only the most used action are visibile as default as shown in the sceenshot.
    The secondary action must be shown in a submenù!
    the container rename function and the export filesystem must be moved in the submenù

- change-2
    image: bugs-screen/change-2.png
    in the panel that show the container details remove the "X" button that is used to clone the container panel!
    the container panel can be closed by clicking on the container row!!!

- change-3
    image: bugs-screen/change-3.png
    all action must be moved in a submenù as done for the change-1

- bug-1
    image: bugs-screen/bug-1.png
    the size of the popup is not always correct for the text that must contains! the image bugs-screen/bug-1.png is an example but open the popup that i'll wrote next and analyse them using your browser and screenshot functionality:
        - containers > prune stopped
        - swarm > initialize swarm / join swarm
        - images & layers > import filesystem
        - volumes > two prune popups
        - registries > login/logout
        - builders & cache > creare builder
        - contexts > create context
        - plugins > install plugin
        - system & prune > System prune / prune popups

- bug-2
  image: bugs-screen/bug-2.png
  containers > run container. selecting privileged the popup crashs!
  [note] investigated, not reproduced — record: .sdd/analysis/docker_management_app-privileged_toggle_verification.md

- bug-3
  the order of the elements of the panels in not set so the order of the element can change randomically based on the output of the docker daemon
  can you implement a sort? you are free to choise the best implementation
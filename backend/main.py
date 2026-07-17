from baseline import create_baseline
from integrity import check_integrity


def main():
    while True:
        print("\n====================================")
        print("FILE INTEGRITY MONITORING SYSTEM")
        print("====================================")
        print("1. Create Baseline")
        print("2. Check File Integrity")
        print("3. Exit")

        choice = input("Choose an option: ").strip()

        if choice == "1":
            create_baseline()
            input("\nPress Enter to return to the main menu...")

        elif choice == "2":
            check_integrity()
            input("\nPress Enter to return to the main menu...")

        elif choice == "3":
            print("Exiting system.")
            break

        else:
            print("Invalid option. Please try again.")


main()
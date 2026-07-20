using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace git_28
{
    internal class Program
    {
        static void Main(string[] args)
        {
            decimal num1, num2, resultado;
            byte opcion;

            do
            {
                Console.WriteLine(i);
                Console.WriteLine("1. suma");
                Console.WriteLine("2. resta");
                Console.WriteLine("3. multiplicación");
                Console.WriteLine("4. división");

                //Pedimos una opción
                Console.Write("Elige una opción (1-4): ");
                opcion = Convert.ToByte(Console.ReadLine());
            }
            while ((opcion < 1)  ||  (opcion > 4));
 

        }
    }
}
